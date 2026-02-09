# High-Risk Issues — Step-by-Step Explanation & Remediation

This guide walks through each **high-risk** finding in plain language: what it means, why it matters, and how to fix it (preferred and alternative options).

## Implementation status (remediations applied)

| Remediation | Status | Notes |
|-------------|--------|--------|
| **CORS** | Done | Worker uses `getAllowedOrigin()` and `patchCors()`. Default includes production + localhost (e.g. `http://localhost:3000`, `:8080`, `:5173`, and `127.0.0.1` variants). Override with env `ALLOWED_ORIGINS` if needed. |
| **500 error** | Done | Generic message in production; set env `DEBUG=1` to expose real `error.message` (dev only). |
| **Rate limiting** | Done | KV-based limits: login 10/min, OTP & recovery 5/10min, recover-reset 10/10min. Set env `RATE_LIMIT_DISABLED=1` to disable (e.g. local testing). |
| **Lockdown script** | Done | Worker and admin/myaccount/home use `sessionStorage` for admin key (with localStorage fallback in Worker-generated contact pages). |
| **Admin key storage** | Done | Admin dashboard and inline lockdown scripts use `sessionStorage` instead of `localStorage`. |
| **Push message XSS** | Done | My Account sanitizes push message HTML with `sanitizePushMessageHtml()` before `innerHTML` (same allowlist as admin). |

---

## Optional configuration — in plain language

After the security fixes, the Worker supports three **optional** settings. You set them in the Cloudflare dashboard (Workers → your Worker → Settings → Variables and Secrets). You don’t have to set any of them for the site to work; they’re there for flexibility (e.g. local development or debugging).

---

### ALLOWED_ORIGINS

**What it is:** A list of web addresses that are allowed to call your API and read the response in the browser.

**In simple terms:**  
By default the Worker allows your live site (**https://deem0u.github.io**) and **common localhost addresses** so you can test and stage on your machine without extra setup. Allowed by default: production, plus `http://localhost:3000`, `http://localhost:8080`, `http://localhost:5173`, and the same ports on `http://127.0.0.1`. The API only accepts requests the browser says are from one of these addresses.

**When you’d use it:**  
- You run the frontend on a **different port** (e.g. `http://localhost:4000`). Add that origin via `ALLOWED_ORIGINS` so it’s allowed.  
- You have a **staging or preview** site on another domain and you want it to call the same API.

**How to set it:**  
In Cloudflare, add a **Variable** named `ALLOWED_ORIGINS`.  
Value: your allowed addresses, comma-separated, no spaces (e.g. `https://deem0u.github.io,http://localhost:3000,http://localhost:4000`). If you set this, it **replaces** the default list, so include production and any localhost ports you need.

**If you don’t set it:**  
The default list (production + localhost 3000, 8080, 5173) is used. You can run and test locally without setting anything.

**Does the risk still persist with this setup?**  
No. The original risk was that **any** website could call your API and **read the response** (because we used `*`). With an allowlist:

- When a user is on **evil-site.com** and that page tries to fetch your API, the browser sends `Origin: https://evil-site.com`. Your Worker only echoes back an origin that’s **in the list** (e.g. your site or localhost). So the response gets `Access-Control-Allow-Origin: https://deem0u.github.io` (or the first in your list), **not** `https://evil-site.com`. The browser then **blocks** evil-site.com from reading the response, because the allowed origin doesn’t match the page’s origin.
- The browser **sets the Origin header** from the real page the user is on. A malicious site cannot pretend to be `deem0u.github.io` or localhost; the browser enforces that.

So **random websites can no longer read your API responses.** The main CORS risk is addressed.

The only remaining nuance: **localhost is in the list**, so a page or app running on your machine at `http://localhost:3000` (or the other allowed ports) can call the API and read the response. That means you’re trusting “whatever is served on those ports on the same machine.” For local testing and staging that’s normal and acceptable; the risk is limited to your own dev environment. If you wanted to lock it down further for production only, you could set **ALLOWED_ORIGINS** to just `https://deem0u.github.io` in production and keep the current default only for dev/staging.

---

### RATE_LIMIT_DISABLED

**What it is:** A switch that turns off “rate limiting” (the rule that says “only X login attempts per minute from this computer”).

**In simple terms:**  
Rate limiting helps stop brute-force attacks and spam (e.g. someone trying thousands of passwords or “send recovery email” in a short time). When you set this to `1`, the Worker stops enforcing those limits.

**When you’d use it:**  
- You’re testing **on your own machine** and you keep hitting “too many attempts” because you’re trying different logins or recovery flows over and over.  
- You’re running **automated or scripted tests** that send many requests in a short time and you don’t want them blocked.

**How to set it:**  
In Cloudflare, add a **Variable** named `RATE_LIMIT_DISABLED` with value `1`.

**If you don’t set it:**  
Rate limiting stays **on** (recommended for the live site). Normal users rarely hit the limits; only heavy or abusive use does.

**Important:** Leave this **unset** (or remove it) for your real, public site. Use it only for local or test environments.

---

### DEBUG

**What it is:** A switch that changes what the API sends back when something goes wrong (a 500 error).

**In simple terms:**  
When the Worker crashes or hits an unexpected error, it normally returns a short, generic message like “An error occurred. Please try again later.” so that visitors and attackers don’t see internal details. When you turn DEBUG on, the API instead returns the **real** error message (and sometimes technical details) so you can see what actually broke.

**When you’d use it:**  
- You’re **debugging** a problem and you need to see the real error (e.g. “KV not configured” or “GitHub API returned 404”) in the browser or in logs, instead of the generic message.  
- You’re only doing this on a **development or test** Worker, not on the one that serves real users.

**How to set it:**  
In Cloudflare, add a **Variable** named `DEBUG` with value `1`.

**If you don’t set it:**  
The API keeps returning the generic message for 500 errors. That’s what you want for production so you don’t leak server or config details.

**Can I still troubleshoot when DEBUG is off?**  
Yes. DEBUG only controls what is **sent back in the HTTP response** to the browser or client. It does **not** affect server-side logging. When DEBUG is off, the Worker still runs `console.error(error)` for every 500, so the full error and stack are written to **Cloudflare’s logs**. You can see them in the Cloudflare dashboard (Workers & Pages → your Worker → Logs) or by running `wrangler tail` in a terminal. So you can keep DEBUG off in production and still use Cursor, the dashboard, or wrangler to inspect what went wrong.

**Important:** Do **not** set DEBUG on your live, public site. Use it only temporarily when you need the real error message in the API response itself (e.g. in the browser Network tab). For normal troubleshooting, use the Cloudflare logs with DEBUG off.

---

### Quick reference

| Setting               | Where to set it        | Typical value                    | Use it when…                          |
|-----------------------|------------------------|-----------------------------------|---------------------------------------|
| **ALLOWED_ORIGINS**   | Cloudflare → Variable  | e.g. `https://deem0u.github.io,http://localhost:4000` | You use a port not in the default list (3000, 8080, 5173) or another domain. |
| **RATE_LIMIT_DISABLED** | Cloudflare → Variable | `1`                               | Only for local/testing.                |
| **DEBUG**             | Cloudflare → Variable  | `1`                               | Only when debugging 500 errors.       |

For normal production use, you usually **don’t** need to set any of these; the defaults are already safe and correct.

---

## 1. Permissive CORS (`Access-Control-Allow-Origin: *`)

### In plain terms

Your API tells the browser: “Any website is allowed to talk to me and read my responses.”  
Normally the browser blocks Site B from reading Site A’s data (the “same-origin policy”). CORS is the rule that says “this server *does* allow other origins.” When you use `*`, you’re saying “allow every origin.”

### Why it’s a problem

- Your Admin and My Account pages send **credentials** (admin key, user token) to the Worker.  
- If an attacker runs a malicious site and a logged-in admin (or user) visits it, that site can try to call your API **from the user’s browser** with the same credentials the browser might send.  
- With `*`, the browser may allow the malicious site to **read the API response**. So the attacker could:  
  - Trigger actions (e.g. change password, create users) by sending requests with the stolen admin key.  
  - Read sensitive data returned by the API.  
- Even if the attacker can’t read your *page’s* localStorage directly (different origin), they could have gotten the key another way (e.g. phishing, XSS elsewhere) and then use it from their own site. CORS `*` then allows that cross-origin use to succeed and responses to be read.

**Bottom line:** You’re leaving the door open for any website to use your API with a user’s credentials and read the results. Restricting CORS closes that door for everyone except your own site.

### Preferred remediation

**Restrict CORS to your real frontend origin(s) only.**

- Decide the exact origin(s) that should call the Worker (e.g. `https://deem0u.github.io`).  
- In the Worker, **stop using `*`**. Either:
  - **Option A (simplest):** Set a **fixed** allowed origin in the response, e.g.  
    `'Access-Control-Allow-Origin': 'https://deem0u.github.io'`  
    Use this when all your pages (admin, myaccount, etc.) are on that one origin.
  - **Option B (multiple origins):** Read the request’s `Origin` header; if it’s in a small allowlist (e.g. `['https://deem0u.github.io', 'http://localhost:3000']`), set  
    `'Access-Control-Allow-Origin': request.headers.get('Origin')`  
    so the browser only allows that same origin to read the response.  
- Keep the rest of your CORS headers (methods, headers, max-age) as they are; only change who is allowed (the origin).

**Result:** Only your own site(s) can call the API and read responses; random websites cannot.

### Alternative remediation

- **Use Cloudflare (or another proxy) to set CORS**  
  If you prefer not to touch Worker code, you can configure CORS at the edge (e.g. Cloudflare Transform Rules or a small proxy) so that responses from your Worker’s URL get an `Access-Control-Allow-Origin` that is your frontend origin, not `*`. The Worker would then not need to send CORS headers (or could send minimal ones).  
- **Keep `*` but don’t send credentials**  
  Theoretically you could try to avoid sending credentials from the browser (e.g. no `Authorization`, no `X-Admin-Key`). That would break your current design (admin and user auth both rely on those). So this is **not** a practical alternative for your app.

**Recommendation:** Prefer the in-Worker fix (Option A or B) so CORS is correct in one place and under your control.

---

## 2. Admin key stored in `localStorage`

### In plain terms

When an admin logs in, the app saves their **admin key** in the browser’s `localStorage`. That means:
- The key stays there until someone explicitly removes it (e.g. “Log out” or clear site data).  
- **Any script** that runs on the same origin (e.g. `https://deem0u.github.io`) can read `localStorage` and send that key to an attacker.

### Why it’s a problem

- If there is **any** way for an attacker to run JavaScript on your origin (e.g. XSS from a bug, a compromised script, or a malicious browser extension), that script can do:  
  `localStorage.getItem('admin_key')`  
  and then send the key to the attacker’s server.  
- With the key, the attacker can call your API as admin: read/edit users, KV data, secrets, etc.  
- Because the key is in **localStorage**, it survives closing the tab and even closing the browser, so the window of exposure is long.

**Bottom line:** The admin key is the “master key” to your backend. Storing it in a place that any same-origin script can read makes one XSS (or similar) enough for full admin compromise.

### Preferred remediation

**Use `sessionStorage` instead of `localStorage` for the admin key.**

- Replace every `localStorage.getItem('admin_key')`, `localStorage.setItem('admin_key', ...)`, and `localStorage.removeItem('admin_key')` in the admin app with `sessionStorage` equivalents.  
- The key is then only available in that **tab** and is cleared when the tab (or browser) is closed.  
- Same-origin XSS can still steal it while the tab is open, but the key is no longer stored long-term, so the “blast radius” and the time window for abuse are smaller.

**Result:** Admin key is no longer persisted across sessions; closing the tab removes it. You still need to fix XSS (e.g. push-message) and consider stronger measures below.

### Alternative remediations

- **Short-lived session token instead of raw key**  
  After admin logs in (with key or email+password), the Worker issues a **short-lived token** (e.g. JWT, 15–60 minutes). The frontend stores **only that token** in sessionStorage and sends it (e.g. `Authorization: Bearer <token>`) instead of the admin key. The raw key is never stored in the browser. This requires Worker changes (new endpoint or auth response) and frontend changes to use the token for all admin API calls. **Best long-term**, but more work.  
- **Don’t store the key at all**  
  Admin enters the key every time they open the dashboard. No localStorage/sessionStorage. Most secure against theft, but poor UX and not practical for daily use.  
- **Content Security Policy (CSP)**  
  Add a strict CSP so only your own scripts can run. This reduces the chance of XSS but doesn’t remove the risk of storing the key; combine with sessionStorage or token.

**Recommendation:** Do the sessionStorage change first (quick win), then plan for a session-token design so the raw admin key never lives in the browser.

---

## 3. No rate limiting on auth and recovery

### In plain terms

Your API doesn’t limit how many times someone can try to log in, request a code, or try a recovery code in a short period. So one client (or attacker) can fire hundreds or thousands of requests per minute.

### Why it’s a problem

- **Passwords:** An attacker can try many passwords (or a list of leaked passwords) against a known or guessed username/email.  
- **OTP / recovery codes:** Your admin recovery uses a 6-digit code (about 1 million possibilities). Without limits, an attacker could try all of them within the 10-minute window.  
- **User recovery (OTP, security questions):** Same idea — many attempts until something works.  
- **Abuse:** Signup, “send OTP”, and “send recovery email” can be spammed to harass users or flood your email/relay.

**Bottom line:** No rate limiting makes brute-force and abuse cheap and easy; a single weak password or a short code can be cracked, and your service can be abused for spam or DoS.

### Preferred remediation

**Add rate limiting at the edge (e.g. Cloudflare).**

- Use **Cloudflare Rate Limiting** (or similar) in front of your Worker so that:
  - **Per IP:** Limit requests per minute (or per 10 minutes) to sensitive paths, e.g.:
    - `/api/auth`, `/api/auth/user` (login)
    - `/api/otp/send`, `/api/otp/verify`
    - `/api/recover`, `/api/recovery/check`, `/api/recovery/verify`, `/api/recovery/check-by-email`
    - `/api/recover/verify-reset-token`, `/api/recover/reset-password`
    - Optionally `/api/signup`
  - Typical values: e.g. 5–10 login attempts per IP per minute; 3–5 OTP/recovery requests per IP per 10 minutes; similar for reset flows.  
- When the limit is exceeded, Cloudflare returns 429 (Too Many Requests) and the request never hits your Worker.  
- You don’t have to change Worker code; configuration is in the Cloudflare dashboard (or via API).

**Result:** Brute force and mass abuse become impractical; failed attempts are capped per IP (and optionally per identifier if you add that later in the Worker).

### Alternative remediations

- **Rate limiting inside the Worker**  
  Maintain a simple in-memory or KV-based counter per IP (and optionally per username/email) for login, OTP, recovery. Increment on each request; if over threshold in the last N minutes, return 429. Works but uses Worker CPU/KV and is trickier to tune; edge rate limiting is usually simpler and more robust.  
- **Only lock or slow down after failures**  
  e.g. After 5 failed logins for a given username, require a 15-minute wait or a CAPTCHA. This reduces brute force but doesn’t stop OTP/recovery spam or distributed attacks from many IPs; combine with IP rate limits.

**Recommendation:** Prefer Cloudflare (or edge) rate limiting first; add per-username or per-email limits in the Worker later if you need finer control.

---

## 4. 500 error responses expose `error.message`

### In plain terms

When something goes wrong in the Worker (e.g. a bug, or GitHub/KV failure), your code catches the error and sends back to the client:  
`{ "error": error.message }`  
with status 500. So whatever is in `error.message` is visible to anyone who gets that response (e.g. in the browser dev tools or in a script).

### Why it’s a problem

- `error.message` (and sometimes stack traces) can include:
  - **File paths** and line numbers on the server.  
  - **Environment details** (e.g. “KV not configured”, “GITHUB_TOKEN missing”).  
  - **Internal logic** (e.g. “User folder not found”, “Invalid token”).  
- Attackers can use this to:
  - Map your infrastructure and code.  
  - Learn which dependencies or config you use.  
  - Refine attacks (e.g. they learn you use KV and GitHub).  
- Users (or scripts) see technical messages that are confusing and sometimes revealing.

**Bottom line:** Treat 500 as “something broke”; the *reason* should stay on the server. Sending `error.message` to the client is an information leak and a bad practice for production.

### Preferred remediation

**Return a generic message to the client; log the real error only on the server.**

- In the Worker’s top-level `catch`, **do not** put `error.message` (or `error.stack`) in the JSON body.  
- Instead, return a fixed, generic message, e.g.  
  `{ "error": "An error occurred. Please try again later." }`  
  with status 500.  
- **Log** the full error (message and stack) using whatever logging you have (e.g. `console.error(error)` in the Worker; Cloudflare captures this in logs).  
- Optionally, in development you can still return `error.message` (e.g. if `env.NODE_ENV === 'development'` or a custom `env.DEBUG`), but in production always use the generic message.

**Result:** Clients never see internal details; you still have full error information in logs for debugging.

### Alternative remediation

- **Sanitize or redact `error.message`**  
  You could try to strip paths and stack traces and send a “safe” part of the message. This is error-prone (easy to miss something) and still may leak hints. Prefer the generic message.  
- **Different status codes**  
  You might return 500 only for unexpected errors and 400/401/404 for “expected” failures, with short, intentional messages (e.g. “Invalid credentials”). Those are fine as long as they don’t expose internals. The main fix is still: never send raw `error.message` for 500.

**Recommendation:** Use the generic message in production and log the real error; no need to send any part of the exception to the client.

---

## 5. Push message XSS (admin HTML rendered with `innerHTML`)

### In plain terms

Admins can set a “push message” (a banner) that appears for a user in My Account. The message is stored as **HTML** and the My Account page inserts it into the page with **`innerHTML`**. So whatever HTML the admin provides is executed as real HTML and JavaScript in the user’s browser.

### Why it’s a problem

- If an admin account is **compromised**, the attacker can set the push message to something like:  
  `<script>/* send user's token/cookies to attacker */</script>`  
  or  
  `<img src="x" onerror="/* same */">`  
- Every user who opens My Account will run that code in their own session. The attacker can then:
  - Steal the user’s JWT (from sessionStorage) and impersonate them.  
  - Change the user’s password, email, or data.  
  - Use the user’s session to do anything the user can do.  
- So one stolen admin account can turn into **account takeover for many users** via this one feature.

**Bottom line:** Treating admin-supplied content as raw HTML is “stored XSS”: the payload is stored on your backend and delivered to every victim. It’s one of the most serious issues because it’s easy to exploit and scales to all users who see the banner.

### Preferred remediation

**Treat the push message as plain text and render it safely (no HTML).**

- **Worker:** Keep storing the message, but treat it as a **single text field** (e.g. `body.text` or keep `body.html` but document that it’s plain text). Don’t encourage or expect HTML.  
- **Frontend (My Account):** When you show the push message, **do not** use `innerHTML`. Use **`textContent`** (or a safe pattern that doesn’t parse HTML), e.g.:  
  `contentEl.textContent = d.html;`  
  (or rename to `d.message`/`d.text` for clarity).  
- If you need line breaks, either:
  - Insert newlines in the text and use CSS `white-space: pre-line`, or  
  - Split on `\n` and create text nodes or `<br>` elements in a controlled way **without** passing user/admin input through `innerHTML`.

**Result:** No script or HTML from the admin can run in the user’s browser; only safe text is shown.

### Alternative remediation

- **Allow a safe subset of HTML and sanitize**  
  If you want bold, links, etc., use a small allowlist of tags (e.g. `<p>`, `<strong>`, `<a>`) and a sanitizer library (e.g. DOMPurify) in the frontend. **Always** sanitize **before** calling `innerHTML`. Never put unsanitized admin input into the DOM.  
- **Render on the server**  
  Have the Worker (or another backend) convert the stored text to safe HTML (e.g. escape everything, then allow only specific tags) and return that. The frontend then still must only insert it in a way that doesn’t re-execute script (sanitizer still recommended).  
- **Remove the feature**  
  If you don’t need push messages, remove them; that removes the risk entirely.

**Recommendation:** Prefer plain text + `textContent` (or controlled line breaks). If you need formatting, add a sanitizer and a strict allowlist and still never trust raw HTML from the admin.

---

## Material impacts to consider before implementing

Below are the main **real-world impacts** of each remediation: what changes for users and operators, what can break, and what to plan for.

---

### 1. CORS — Restricting to specific origin(s)

| Impact type | What to consider |
|-------------|------------------|
| **Who can call the API** | Only requests from the origin(s) you allow (e.g. `https://deem0u.github.io`) will get a response the browser can read. Any other origin will get a CORS error in the browser and the frontend will not be able to read the response. |
| **Local development** | If you ever open the admin or myaccount from **localhost** (e.g. `http://localhost:8000`) or a **file://** URL, those are different origins. They will be **blocked** unless you add them to the allowlist. So you need to either: (a) allowlist `http://localhost` (and optionally a specific port) for dev, or (b) always test against the live GitHub Pages URL. |
| **Staging / preview deployments** | If you use GitHub branch previews, Vercel/Netlify preview URLs, or another domain for staging, those origins will be blocked unless you add them. Decide upfront which origins are legitimate and add them. |
| **Other clients** | Mobile apps, desktop apps, or scripts that call your API from a different origin will stop working unless you add that origin. Your current setup uses only the GitHub Pages origin; if that’s the only client, impact is zero. |
| **Operational** | When you add a new frontend (e.g. new subdomain or staging URL), you must update the Worker’s allowed-origin list and redeploy. |

**Summary:** List all origins you need (production, optional localhost for dev, optional staging). Implement with a fixed origin or a small allowlist. Test from each origin after deployment.

---

### 2. Admin key in sessionStorage (instead of localStorage)

| Impact type | What to consider |
|-------------|------------------|
| **Login persistence** | Admins will **no longer stay logged in** after they close the browser or the tab. Every new tab or new session will require entering the admin key (or email + password) again. This is an intentional security/UX trade-off. |
| **Multiple tabs** | Each tab has its own sessionStorage. So an admin can be logged in in Tab A and Tab B independently. Closing Tab A does not log out Tab B until that tab is closed. |
| **Bookmarks** | A bookmarked link to the dashboard (e.g. `https://deem0u.github.io/admin/`) will open a page that is **not** logged in; the admin must sign in again. |
| **Lockdown script on contact pages** | Contact pages (and any page that uses the injected “lockdown check” script) currently read the admin key from **localStorage** to decide whether to hide the lockdown overlay for an admin. If you move the key to **sessionStorage only**, that script must be updated to read from **sessionStorage** instead. Otherwise, when an admin opens a contact page (same origin), the script won’t find the key and the overlay might show incorrectly. So you need to change **two places**: (1) admin dashboard: store and read key from sessionStorage, (2) Worker: in the generated contact-page HTML, the injected script must use `sessionStorage.getItem('admin_key')` instead of `localStorage.getItem('admin_key')`. |
| **No “remember me”** | There is no way to “remember” the admin across restarts without storing the key somewhere (which we’re avoiding for security). So the only alternative for convenience is the “session token” approach (Worker issues a short-lived token after login; frontend stores only that). |

**Summary:** Expect admins to re-enter credentials when they open a new tab or new day. Update both the admin UI and the Worker-injected lockdown script to use sessionStorage consistently.

---

### 3. Rate limiting (auth, OTP, recovery)

| Impact type | What to consider |
|-------------|------------------|
| **Legitimate users hitting the limit** | If a user (or admin) mistypes their password many times in a short period, or requests “send OTP” / “send recovery email” several times, they may get **429 Too Many Requests** and have to wait (e.g. 1–10 minutes) before trying again. You should set limits high enough for normal use (e.g. 5–10 login attempts per IP per minute; 3–5 OTP/recovery requests per IP per 10 minutes) and document or show a friendly message: “Too many attempts. Please try again in X minutes.” |
| **Shared IP addresses** | Users behind the same IP (office, school, café, home NAT) share the same rate limit. So if one person triggers the limit (e.g. many failed logins), others on that IP may be temporarily blocked too. This is a known trade-off of IP-based limiting; you can soften it by (a) using generous limits, or (b) adding per-username/email limits in the Worker so that one user’s failures don’t block another. |
| **Recovery flow** | If “request recovery code” or “send OTP” is rate-limited (e.g. 3 per 10 minutes), users who don’t receive the email and retry will hit the limit. Consider a clear message: “If you didn’t receive the email, check spam or wait a few minutes before requesting again.” |
| **Operational** | Rate limiting is usually configured in the Cloudflare dashboard (or similar). You need to define which paths to limit and the thresholds. No change to Worker code is strictly required if you use edge rate limiting; if you add rate limiting inside the Worker (e.g. with KV), you do need to deploy and maintain that logic. |

**Summary:** Choose limits that allow normal use and occasional retries; communicate “too many attempts” clearly; accept that shared IPs may share the limit unless you add per-user limits later.

---

### 4. 500 error — Generic message (hide error.message)

| Impact type | What to consider |
|-------------|------------------|
| **User-facing messages** | Users and admins will see a **generic** message (e.g. “An error occurred. Please try again later.”) instead of technical text (e.g. “KV not configured”, “GitHub API returned 404”). The frontend already displays `d.error` in alerts; no code change is required there—only the **content** of `d.error` changes. So from a UX perspective, errors will look the same (an alert box) but with a friendlier, non-technical message. |
| **Debugging** | You will **no longer** be able to diagnose the root cause from the client (browser dev tools or user report). You **must** rely on **server-side logs** (e.g. Cloudflare Workers logs, `console.error` in the Worker) to see the real error message and stack. Ensure your team knows where to find these logs and that logging is enabled. |
| **Expected vs unexpected errors** | Your API already returns specific messages for “expected” failures (e.g. 401 “Invalid email or password”, 400 “Missing username”). Those are unchanged. Only **uncaught exceptions** (500) will return the generic message. So normal validation and auth errors still give clear feedback. |

**Summary:** No breaking change for the frontend. Better for security and for user-facing clarity; debugging moves to server logs only for 500s.

---

### 5. Push message XSS — Safe rendering (plain text or sanitizer)

| Impact type | What to consider |
|-------------|------------------|
| **Option A: Plain text only (textContent)** | **Feature change:** The admin UI today has a **rich-text toolbar** (bold, italic, underline, links, lists) and sends **HTML** to the API. If you switch to plain text on the My Account side (render with `textContent`): (1) **Existing messages** already stored in KV may contain HTML (e.g. `<p>Please update your details.</p>`). When displayed with `textContent`, that HTML will show as **literal text** (users will see the tags). You may want a one-time migration or a one-time strip of tags when loading old messages. (2) The **admin toolbar** would become misleading (it suggests formatting that no longer appears). You’d either remove or repurpose the toolbar and document that push messages are plain text only. |
| **Option B: Sanitizer in My Account (keep rich text)** | Your admin already uses **sanitizePushMessageHtml** (allowlist of tags: b, i, u, strong, em, ul, ol, li, a, p, br, span; links restricted to http(s)). The vulnerability is that **My Account** renders the API response with `innerHTML` without sanitizing. You can **keep** rich text by running a **client-side sanitizer** in My Account (same allowlist, or a library like DOMPurify with a strict config) **before** `innerHTML`. Then: (1) No change to the admin experience (toolbar and formatting still work). (2) Existing messages in KV continue to display correctly. (3) Even if the API or KV were ever compromised and returned malicious HTML, the sanitizer would strip script and dangerous attributes. This option has **minimal material impact** and fixes the XSS. |
| **Recommendation** | Option B (sanitizer in My Account) preserves current behaviour and fixes the risk with less disruption. Option A (plain text) is simpler and maximally safe but requires adjusting the admin UI and handling existing HTML in KV. |

**Summary:** If you want to keep bold/links/lists in push messages, add a sanitizer in My Account and keep sending HTML from admin. If you prefer no HTML at all, switch to plain text and update admin UI and existing data.

---

## Order of implementation

A practical order to implement the high-risk fixes:

1. **500 error message** — Quick one-line change in the Worker; stops information leakage immediately.  
2. **Push message XSS** — Change to `textContent` (and optionally rename to `message`/`text`); prevents stored XSS for all users.  
3. **CORS** — Set allowed origin(s) in the Worker so only your site can use the API.  
4. **Admin key in sessionStorage** — Swap localStorage for sessionStorage in the admin app.  
5. **Rate limiting** — Configure at Cloudflare (or edge) for auth, OTP, and recovery endpoints.

After that, you can continue with the medium-risk items (internal endpoint secret, JWT secret, recovery code strength, user enumeration, etc.) as described in the main Security Risk Audit.
