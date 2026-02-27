# Security and Risk Audit — Digital Luggage Tags

**Scope:** Cloudflare Worker API, Admin dashboard, My Account portal, KV storage, and related configuration.  
**Focus:** Data breaches, unauthorized access to KV and stored information, misconfigurations, and code vulnerabilities.

**Last full audit:** See sections below. **Update (2026-02-11):** Re-audit pass; several prior high findings have been remediated (CORS, 500 error body, push-message sanitization, rate limiting). See §11 Audit update (2026-02-11).

---

## Executive Summary

The application uses a clear split between admin (X-Admin-Key) and user (JWT Bearer) auth, with `validateAuth(username, request, env)` enforcing same-user or admin for user-scoped routes. KV access is gated by these checks. **Remediated since last audit:** CORS is allowlist-based; 500 responses use a generic message unless `DEBUG` is set; push messages are sanitized before render; rate limiting is in place for auth/signup/OTP/recovery. **Remaining risks:** Admin key and JWT in client storage (XSS impact), internal setup endpoint, and secrets API returning sensitive data. **Remediated (2026-02-11):** User enumeration (generic responses for check-username, check-account-email, recovery/check); email relay uses constant-time secret compare; QR code script has SRI and crossorigin; admin OTP read is logged. Remediations are listed per finding.

---

## 1. Access Control & Authorization

### 1.1 ✅ User-scoped routes (IDOR prevention)

- **GET/PUT /api/profile/:username**, **GET/PUT /api/secrets/:username**, **GET/POST/DELETE /api/page/:username/...** all use `validateAuth(username, request, env)`. The path `username` must match the JWT `username` (case-insensitive) or the request must be admin. Admin can act on any user by supplying that username in the path.
- **Finding:** No IDOR on user-scoped API routes; access control is correctly enforced.

### 1.2 ✅ Admin-only routes

- Routes under `/api/admin/*`, `/api/keys`, `/api/pages`, `/api/account-emails`, `/api/account-profiles`, `/api/account-details-sent/`, `/api/secrets-status` require `isAdmin(request, env)` or `isPrimaryAdmin(request, env)` where appropriate.
- **Finding:** Admin routes are protected; secondary keys have limited privileges where intended (e.g. primary-only for admin email/key changes).

### 1.3 ⚠️ Internal endpoint — single secret

- **POST /api/internal/set-admin-credentials** is protected only by `X-Setup-Secret` or `Authorization: Bearer <ADMIN_SETUP_SECRET>`. No other auth.
- **Risk:** If `ADMIN_SETUP_SECRET` is weak, guessable, or leaked, an attacker can set admin email, password, and admin key and take over the dashboard.
- **Recommendation:** Use a long, random secret (e.g. 32+ bytes hex); store only in Cloudflare secrets; restrict use to one-time or out-of-band setup; consider IP allowlisting or removing the route in production if not needed.

### 1.4 ✅ Page content (GET /api/page/:username/...)

- **GET /api/page/:username/:contactpagename** requires `validateAuth(username, ...)`. Only the owning user or admin can read page content via the API. Public contact pages are served as static HTML from GitHub Pages, not through this endpoint.
- **Finding:** No unauthorized read of private page content via the API.

---

## 2. CORS & Cross-Origin Risk

### 2.1 ✅ CORS restricted to allowlist (remediated)

- **Location:** `cloudflare-worker/worker.js` — `getAllowedOrigin(request, env)` and `patchCors(response, allowedOrigin)`. Origin is taken from request and must be in allowlist (default: `https://deem0u.github.io` plus localhost ports); `Access-Control-Allow-Origin` is set to that origin, not `*`.
- **Finding:** CORS no longer permits arbitrary origins; only configured origins (env `ALLOWED_ORIGINS` or default list) are allowed. Reduces risk of other sites calling the API with user credentials.

---

## 3. Client-Side Storage & Credentials

### 3.1 🔴 Admin key in localStorage (High)

- **Location:** `admin/index.html` — admin key stored in `localStorage.setItem('admin_key', key)` and sent as `X-Admin-Key`.
- **Risk:** Persists across sessions and is accessible to any same-origin script. An XSS vulnerability on the admin or any page on the same origin (e.g. deem0u.github.io) could steal the key and gain full admin access to KV and user data.
- **Recommendation:** Prefer `sessionStorage` to limit exposure to the tab session; ensure strict CSP and input sanitization to reduce XSS risk. Consider not storing the raw key at all and using a short-lived session token issued by the Worker after admin login.

### 3.2 ⚠️ User JWT in sessionStorage (Medium)

- **Location:** `myaccount/index.html` — JWT stored in `sessionStorage` under `edit_session`.
- **Risk:** Session-scoped, so slightly better than localStorage; still vulnerable to XSS on the same origin. The JWT grants access to that user’s profile, secrets, and contact pages.
- **Recommendation:** Keep using sessionStorage; add CSP and sanitize all dynamic content (see push-message XSS below).

---

## 4. KV & Sensitive Data Exposure

### 4.1 ⚠️ Secrets API returns plaintext recovery data (Medium)

- **Location:** `handleGetSecrets` returns `accountEmail`, `dob`, and `secretQuestions` (including **answers**) in the JSON response. Access is restricted to the same user or admin via `validateAuth`.
- **Risk:** Security question answers and DOB are sensitive. If an admin account is compromised or a user’s JWT is stolen, this data is exposed. Transmit only over HTTPS (enforced by Cloudflare).
- **Recommendation:** Consider not returning security answers in API responses; allow admin to “set” or “reset” without echoing answers back. At minimum, ensure TLS and short-lived admin sessions.

### 4.2 ⚠️ Admin can read user OTP (Medium) — audit log in place

- **Location:** `handleGetSecrets` — when `auth.isAdmin && storedOtp`, the response includes `payload.otp = storedOtp` (plaintext one-time password). The Worker logs `"Admin OTP read"` plus the username when returning OTP to an admin (audit trail in Cloudflare logs).
- **Risk:** By design for admin-assisted recovery, but any compromise of admin credentials allows reading active OTPs and signing in as users.
- **Recommendation:** Treat as intended but sensitive; use primary/secondary key discipline. Check Cloudflare logs when auditing admin OTP access.

### 4.3 ✅ No KV key listing for unauthenticated users

- List/scan operations (e.g. KV list with prefix) are only used in admin or authenticated user flows. No public endpoint exposes KV keys or values without auth.
- **Finding:** KV is not exposed to anonymous callers.

---

## 5. Authentication & Recovery

### 5.1 ✅ Rate limiting in place (remediated)

- **Location:** `cloudflare-worker/worker.js` — `checkRateLimit(request, env, keyPrefix, limit, windowSec)` using KV; applied to login (10/60s), signup (5/600s), OTP send/verify (5 and 10/600s), recovery check/verify (5/600s), recover reset (10/600s). Returns 429 when over limit. Can be disabled with `RATE_LIMIT_DISABLED=1`.
- **Finding:** Auth, signup, OTP, and recovery endpoints are rate-limited by IP. Reduces brute-force and abuse; ensure KV is available for rate-limit keys.

### 5.2 ⚠️ Admin recovery code entropy (Medium)

- **Location:** `generateRecoveryCode()` — 6-digit code from 3 random bytes modulo 1000000; expiry 10 minutes.
- **Risk:** ~10^6 possibilities; without rate limiting, an attacker who can trigger the recovery flow and guess codes could reset admin password.
- **Recommendation:** Keep 10-minute expiry; add rate limiting (e.g. max attempts per IP and per admin email). Consider longer codes or alphanumeric for higher entropy.

### 5.3 ✅ Admin password reset token (strong)

- **Location:** Reset token is 32 bytes from `crypto.getRandomValues`, stored in KV with 1-hour expiry. No reuse after use.
- **Finding:** Reset token is cryptographically strong and single-use.

### 5.4 ✅ JWT secret: single name (remediated)

- **Location:** Worker uses only `env.JWT_SECRET` for signing/verifying user JWTs. No fallback to another name.
- **Finding:** One secret name (JWT_SECRET) eliminates env mismatch. Ensure the value is long and random (e.g. 32+ chars) and stored only in Cloudflare secrets. If you previously used SESSION_SECRET, set JWT_SECRET to the same value (or rotate) and redeploy; see JWT-SECRET-EXPLAINED.md.

---

## 6. User Enumeration & Information Disclosure

### 6.1 ✅ Generic enumeration responses (remediated 2026-02-11)

- **Endpoints:**  
  - **GET /api/check-username/:username** — returns generic `{ status: 'ok' }` for valid format (no `available`); format errors still return 400 with message.  
  - **GET /api/check-account-email/:email** — returns generic `{ status: 'ok' }` (no `available`).  
  - **POST /api/recovery/check** and **POST /api/recovery/check-by-email** — always return the same shape: `{ message: "If an account exists and is eligible for recovery...", recoveryQuestionId }` or `recoveryQuestionIds`; no `exists` or `canRecover`. Real or random question IDs so response does not leak existence.
- **Finding:** Account existence and recovery eligibility are no longer disclosed by these endpoints. Frontend (home, myaccount, admin) updated to not rely on availability from check endpoints; “username taken” / “email in use” appear only on signup or profile submit when the server returns 409.

### 6.2 ✅ 500 error body no longer leaks details (remediated)

- **Location:** Worker top-level catch: `const message = env.DEBUG ? error.message : 'An error occurred. Please try again later.'`; 500 response uses `message`.
- **Finding:** In production (without `DEBUG`), clients receive a generic message. Set `DEBUG` only in non-production if needed for diagnostics.

---

## 7. Injection & XSS

### 7.1 ✅ Contact form and contact page HTML (Worker)

- **Location:** Worker uses `escapeHtml` / local `esc` for contact form email body and for `generateContactPageHTML` (givenName, familyName, contactEmail, mobile, etc.). Characters `& < > " '` are escaped.
- **Finding:** Contact form and generated contact page HTML are protected against HTML injection/XSS in those fields.

### 7.2 ✅ Push message HTML sanitized (remediated)

- **Location:** `myaccount/index.html` — `sanitizePushMessageHtml(msg.html)` is used before assigning to `contentEl.innerHTML`. Allowlist: `b`, `i`, `u`, `strong`, `em`, `ul`, `ol`, `li`, `a`, `p`, `br`, `span`, `blockquote`; links restricted to http(s).
- **Finding:** Admin-supplied push message HTML is sanitized (tag allowlist and link scheme) before render, reducing XSS from push messages. Continue to restrict allowed tags and attributes if extending the allowlist.

### 7.3 ⚠️ Other innerHTML usage (Medium)

- **Location:** e.g. `showAlert(id, msg, type)` and `showStatusBanner(msg, ...)` use `innerHTML` with `msg` or derived content. If `msg` ever comes from API or user input without sanitization, XSS is possible.
- **Recommendation:** Ensure all strings passed to `showAlert` / `showStatusBanner` are either server-escaped or sanitized; or use `textContent` for user/API-derived messages and only inject structure (e.g. wrapper div) without raw message HTML.

---

## 8. Configuration & Secrets Management

### 8.1 ✅ Sensitive values not in repo

- **wrangler.toml** documents that `GITHUB_TOKEN`, `EMAIL_RELAY_SECRET`, `JWT_SECRET`, `ADMIN_SETUP_SECRET` are set via Cloudflare Dashboard (secrets). KV namespace id and non-secret vars are in the file.
- **Finding:** No hardcoded secrets in the repo; good practice.

### 8.2 ✅ Email relay secret — constant-time compare (remediated 2026-02-11)

- **Location:** Vercel email relay `email-relay/api/send.js`. Worker sends `X-Relay-Secret`; relay compares with `RELAY_SECRET` using a constant-time comparison (SHA-256 hash of both values then `crypto.timingSafeEqual`).
- **Finding:** Timing attacks on the relay secret are mitigated. Keep `RELAY_SECRET` long and random.

### 8.3 ✅ GitHub token usage

- **Location:** `GITHUB_TOKEN` is used only in Worker server-side for GitHub API calls. Not exposed to client.
- **Finding:** Token is not leaked to the browser; ensure it’s stored only as a Cloudflare secret and has minimal scope (e.g. repo for the single repo).

---

## 9. Summary Table

| Area              | Severity | Finding |
|-------------------|----------|---------|
| CORS              | ✅ Remediated | Allowlist-based origin; not `*`. |
| Admin key storage | High     | Admin key in `localStorage`; XSS or same-origin compromise could steal it. |
| Rate limiting     | ✅ Remediated | KV-based rate limits on login, signup, OTP, recovery. |
| 500 error body    | ✅ Remediated | Generic message unless `DEBUG`; no leak of internal details. |
| Push message XSS  | ✅ Remediated | Push message HTML sanitized (tag allowlist) before innerHTML. |
| Internal endpoint | Medium   | `/api/internal/set-admin-credentials` protected only by one secret. |
| Secrets API       | Medium   | Returns DOB and security answers in plaintext (access-controlled). |
| Admin OTP read    | Medium   | Admin can read user OTP from GET secrets (by design but sensitive). |
| JWT secret config | ✅ Remediated | Single name (JWT_SECRET); ensure long random value. |
| Recovery code     | Medium   | 6-digit code, 10 min; rate limiting now mitigates brute force. |
| User enumeration  | ✅ Remediated | Generic responses; no exists/available/canRecover disclosed. |
| Alert/banner HTML | Medium   | innerHTML used for alerts; ensure messages are escaped or sanitized. |
| Third-party script| ✅ Remediated | QR code script (admin, home, myaccount) has SRI (sha384) and crossorigin="anonymous". |

---

## 10. Recommended Remediation Order

1. ~~**Immediate:** Restrict CORS.~~ **Done:** Allowlist in place.  
2. ~~**Immediate:** 500 error body.~~ **Done:** Generic message unless DEBUG.  
3. ~~**High:** Push message sanitization.~~ **Done:** sanitizePushMessageHtml allowlist.  
4. ~~**High:** Rate limiting.~~ **Done:** checkRateLimit on auth/signup/OTP/recovery.  
5. **High:** Move admin key to sessionStorage and/or replace with short-lived session tokens; harden against XSS (CSP, sanitization).  
6. ~~**Medium:** Standardize JWT secret.~~ **Done:** Worker uses only JWT_SECRET; ensure strong value.  
7. **Medium:** Harden internal setup endpoint (strong secret, consider disabling after setup).  
8. **Medium:** Review whether secrets API must return security answers; reduce or mask if possible.  
9. **Ongoing:** Ensure all user/API-derived content shown in the UI is escaped or sanitized before innerHTML.  
10. **Low — remediated:** SRI (sha384) and `crossorigin="anonymous"` added for QR code script on admin, home, and myaccount.

---

## 11. Audit update (2026-02-11)

Re-audit pass after QR modal alignment (admin, myaccount), relay default name (DigiCon iD), and template download feature.

- **CORS:** Confirmed allowlist via `getAllowedOrigin` / `patchCors`; no `*`.  
- **500 responses:** Confirmed generic message when `env.DEBUG` not set.  
- **Push message:** Confirmed `sanitizePushMessageHtml` used before `contentEl.innerHTML` in My Account.  
- **Rate limiting:** Confirmed `checkRateLimit` used for login, signup, OTP, recovery, recover-reset.  
- **New surface:** QR code library loaded from `cdn.jsdelivr.net` (admin, home, myaccount); SRI (sha384) and crossorigin added 2026-02-11.

No changes to access control, KV exposure, or auth flows. Previous high findings for CORS, 500 body, push XSS, and rate limiting are marked remediated.

---

*Audit performed against the codebase as of the audit date. Re-run after significant changes or before major releases.*
