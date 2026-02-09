# Security and Risk Audit — Digital Luggage Tags

**Scope:** Cloudflare Worker API, Admin dashboard, My Account portal, KV storage, and related configuration.  
**Focus:** Data breaches, unauthorized access to KV and stored information, misconfigurations, and code vulnerabilities.

---

## Executive Summary

The application uses a clear split between admin (X-Admin-Key) and user (JWT Bearer) auth, with `validateAuth(username, request, env)` enforcing same-user or admin for user-scoped routes. KV access is gated by these checks. Several areas still pose risk: **permissive CORS**, **sensitive data in client storage**, **no rate limiting**, **user enumeration**, **error message leakage**, **push-message XSS**, and **reliance on secret strength** for internal and recovery flows. Remediations are listed per finding.

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

### 2.1 🔴 Permissive CORS (High)

- **Location:** `cloudflare-worker/worker.js` — `corsHeaders` uses `'Access-Control-Allow-Origin': '*'`.
- **Risk:** Any website can send requests to your Worker with the user’s credentials (Cookie, `Authorization: Bearer`, `X-Admin-Key`). If a user has the admin dashboard open and visits a malicious site, that site can issue fetch requests to your API with `credentials: 'include'` or by tricking the user into pasting the admin key; with `*`, the browser will allow the cross-origin response to be read. Combined with admin key in `localStorage` (see 3.1), a malicious page on another origin can’t read localStorage directly but could use a same-origin compromise or a browser extension to exfiltrate the key and then call your API from their origin.
- **Recommendation:** Set `Access-Control-Allow-Origin` to the exact origin(s) of your frontends (e.g. `https://deem0u.github.io`). Avoid `*` when any endpoint uses credentials or returns sensitive data.

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

### 4.2 ⚠️ Admin can read user OTP (Medium)

- **Location:** `handleGetSecrets` — when `auth.isAdmin && storedOtp`, the response includes `payload.otp = storedOtp` (plaintext one-time password).
- **Risk:** By design for admin-assisted recovery, but any compromise of admin credentials allows reading active OTPs and signing in as users.
- **Recommendation:** Treat as intended but sensitive; audit admin access and use primary/secondary key discipline. Optionally log when OTP is read by admin.

### 4.3 ✅ No KV key listing for unauthenticated users

- List/scan operations (e.g. KV list with prefix) are only used in admin or authenticated user flows. No public endpoint exposes KV keys or values without auth.
- **Finding:** KV is not exposed to anonymous callers.

---

## 5. Authentication & Recovery

### 5.1 🔴 No rate limiting (High)

- **Location:** All auth and recovery endpoints — e.g. `POST /api/auth`, `POST /api/auth/user`, `POST /api/signup`, `POST /api/otp/send`, `POST /api/otp/verify`, `POST /api/recover`, `POST /api/recovery/check`, `POST /api/recovery/verify`, `POST /api/recover/verify-reset-token`, `POST /api/recover/reset-password`.
- **Risk:** Brute force on passwords, OTPs, or recovery codes; credential stuffing; abuse of signup/OTP/recovery to spam or enumerate users.
- **Recommendation:** Add rate limiting (e.g. by IP and/or identifier) at the Worker or at the edge (Cloudflare Rate Limiting). Limit failed logins, OTP requests, and recovery attempts per user/email/IP per time window.

### 5.2 ⚠️ Admin recovery code entropy (Medium)

- **Location:** `generateRecoveryCode()` — 6-digit code from 3 random bytes modulo 1000000; expiry 10 minutes.
- **Risk:** ~10^6 possibilities; without rate limiting, an attacker who can trigger the recovery flow and guess codes could reset admin password.
- **Recommendation:** Keep 10-minute expiry; add rate limiting (e.g. max attempts per IP and per admin email). Consider longer codes or alphanumeric for higher entropy.

### 5.3 ✅ Admin password reset token (strong)

- **Location:** Reset token is 32 bytes from `crypto.getRandomValues`, stored in KV with 1-hour expiry. No reuse after use.
- **Finding:** Reset token is cryptographically strong and single-use.

### 5.4 ⚠️ JWT secret configuration (Medium)

- **Location:** Worker uses `env.JWT_SECRET || env.SESSION_SECRET` for signing/verifying user JWTs.
- **Risk:** Two different secret names; if one is set in one environment and the other in another, tokens may not validate across deployments. Weak or default secret would allow forging JWTs.
- **Recommendation:** Standardize on one secret name (e.g. `JWT_SECRET`) and document it. Ensure a long, random value (e.g. 32+ bytes) and store only in Cloudflare secrets.

---

## 6. User Enumeration & Information Disclosure

### 6.1 ⚠️ Unauthenticated user/account existence checks (Medium)

- **Endpoints:**  
  - **GET /api/check-username/:username** — returns `available: true/false`.  
  - **GET /api/check-account-email/:email** — returns `available: true/false`.  
  - **POST /api/recovery/check** (body: `username`) — returns `exists`, `canRecover`, and optionally `recoveryQuestionId`.  
  - **POST /api/recovery/check-by-email** (body: `accountEmail`) — same idea.
- **Risk:** Enables enumeration of usernames and account emails and whether an account can use recovery. Often acceptable for UX (e.g. “username taken”, “we’ll send recovery if this email exists”); still discloses account existence.
- **Recommendation:** If acceptable for your threat model, keep but add rate limiting. If you want to reduce enumeration, return generic messages (e.g. “If an account exists, you will receive an email”) and avoid differing responses for “exists but can’t recover” vs “doesn’t exist”.

### 6.2 🔴 Server error messages leak internal details (High)

- **Location:** Top-level `catch` in Worker: `return jsonResponse({ error: error.message }, 500);`
- **Risk:** Any uncaught exception (e.g. from GitHub API, KV, or code bugs) returns `error.message` to the client. This can leak paths, configuration hints, or stack details.
- **Recommendation:** In production, return a generic message (e.g. “An error occurred”) and log the full error server-side only. Use a single place for 500 responses so you don’t leak stack or env details.

---

## 7. Injection & XSS

### 7.1 ✅ Contact form and contact page HTML (Worker)

- **Location:** Worker uses `escapeHtml` / local `esc` for contact form email body and for `generateContactPageHTML` (givenName, familyName, contactEmail, mobile, etc.). Characters `& < > " '` are escaped.
- **Finding:** Contact form and generated contact page HTML are protected against HTML injection/XSS in those fields.

### 7.2 🔴 Push message HTML rendered without sanitization (High)

- **Location:** Worker **PUT /api/push-message/:username** stores `body.html` in KV. **My Account** fetches it and does `contentEl.innerHTML = d.html` (`myaccount/index.html`).
- **Risk:** Admin-controlled HTML is rendered as raw HTML. A compromised admin (or malicious admin) can set `html` to `<script>...</script>` or other active content, leading to XSS in the context of the user’s My Account session (session hijack, token/keystroke exfiltration).
- **Recommendation:** Either (a) treat push message as plain text and render with `textContent` or (b) allow a small subset of HTML and sanitize (e.g. allow only `<p>`, `<strong>`, `<a>` with safe attributes) via a sanitizer (e.g. DOMPurify) before `innerHTML`. Prefer (a) if rich text is not required.

### 7.3 ⚠️ Other innerHTML usage (Medium)

- **Location:** e.g. `showAlert(id, msg, type)` and `showStatusBanner(msg, ...)` use `innerHTML` with `msg` or derived content. If `msg` ever comes from API or user input without sanitization, XSS is possible.
- **Recommendation:** Ensure all strings passed to `showAlert` / `showStatusBanner` are either server-escaped or sanitized; or use `textContent` for user/API-derived messages and only inject structure (e.g. wrapper div) without raw message HTML.

---

## 8. Configuration & Secrets Management

### 8.1 ✅ Sensitive values not in repo

- **wrangler.toml** documents that `GITHUB_TOKEN`, `EMAIL_RELAY_SECRET`, `JWT_SECRET`/`SESSION_SECRET`, `ADMIN_SETUP_SECRET` are set via Cloudflare Dashboard (secrets). KV namespace id and non-secret vars are in the file.
- **Finding:** No hardcoded secrets in the repo; good practice.

### 8.2 ⚠️ Email relay secret (Vercel)

- **Location:** Worker sends `X-Relay-Secret` to the Vercel email relay; relay compares with `RELAY_SECRET`. Comparison is string equality (not constant-time).
- **Risk:** In theory, timing attacks could help guess the secret; in practice usually low impact for long random secrets. Ensure `RELAY_SECRET` is long and random.
- **Recommendation:** Use a long random value; optional: use a constant-time compare if you have a crypto utility.

### 8.3 ✅ GitHub token usage

- **Location:** `GITHUB_TOKEN` is used only in Worker server-side for GitHub API calls. Not exposed to client.
- **Finding:** Token is not leaked to the browser; ensure it’s stored only as a Cloudflare secret and has minimal scope (e.g. repo for the single repo).

---

## 9. Summary Table

| Area              | Severity | Finding |
|-------------------|----------|---------|
| CORS              | High     | `Access-Control-Allow-Origin: *` allows any origin to call API with credentials. |
| Admin key storage| High     | Admin key in `localStorage`; XSS or same-origin compromise could steal it. |
| Rate limiting     | High     | No rate limiting on auth, signup, OTP, recovery — brute force and abuse possible. |
| 500 error body    | High     | `error.message` returned to client can leak internal details. |
| Push message XSS  | High     | Admin-supplied HTML rendered with `innerHTML` in My Account. |
| Internal endpoint | Medium   | `/api/internal/set-admin-credentials` protected only by one secret. |
| Secrets API       | Medium   | Returns DOB and security answers in plaintext (access-controlled). |
| Admin OTP read    | Medium   | Admin can read user OTP from GET secrets (by design but sensitive). |
| JWT secret config | Medium   | Two secret names; weak or inconsistent secret risks forged JWTs. |
| Recovery code     | Medium   | 6-digit code, 10 min — add rate limiting to mitigate brute force. |
| User enumeration  | Medium   | check-username, check-account-email, recovery/check expose existence. |
| Alert/banner HTML | Medium   | innerHTML used for alerts; ensure messages are escaped or sanitized. |

---

## 10. Recommended Remediation Order

1. **Immediate:** Restrict CORS to your actual frontend origin(s).  
2. **Immediate:** Stop returning raw `error.message` in 500 responses; log server-side, return generic message to client.  
3. **High:** Sanitize or disallow HTML for push messages; render as text or with a safe subset of HTML.  
4. **High:** Add rate limiting for auth, signup, OTP, and recovery endpoints (IP and/or identifier).  
5. **High:** Move admin key to sessionStorage and/or replace with short-lived session tokens; harden against XSS (CSP, sanitization).  
6. **Medium:** Standardize JWT secret to one env var; ensure strong value.  
7. **Medium:** Harden internal setup endpoint (strong secret, consider disabling after setup).  
8. **Medium:** Review whether secrets API must return security answers; reduce or mask if possible.  
9. **Ongoing:** Ensure all user/API-derived content shown in the UI is escaped or sanitized before innerHTML.

---

*Audit performed against the codebase as of the audit date. Re-run after significant changes or before major releases.*
