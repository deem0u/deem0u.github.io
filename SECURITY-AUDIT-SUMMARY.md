# Security Risk Audit — Plain-Language Summary

This document summarizes the security review of the Digital Luggage Tags site: what risks were found, what they mean for admins and end users, what would be compromised if something went wrong, what was fixed and how, and what was left unchanged and why.

---

## Part 1: The risks (in plain language)

### High-risk issues (what we fixed)

**1. The site allowed any other website to talk to its API and read the response (CORS)**  
- **Risk:** A malicious site could, in theory, use your login (admin or user) from the browser to call the site’s API and read the answers. So someone could try to abuse your session if you had the site open and visited a bad site.  
- **Impact:** **Admins** — Someone could try to use the admin session to see or change user data. **End users** — Someone could try to use a user’s session to see or change that user’s contact page or profile. **Site** — Reputation and trust; possible misuse of the service.  
- **What would be compromised:** Whatever the stolen session could access: for admin, all users’ data and settings; for a user, that user’s profile, contact page, and recovery info.

**2. The admin “key” was stored in a way that stayed on the device and any script on the site could read it**  
- **Risk:** The key that proves “I am the admin” was kept in browser storage that survives closing the tab and that any script on the same site could read. If there had been a way to run malicious script (e.g. a bug), that script could have stolen the key and then acted as admin.  
- **Impact:** **Admins** — Full loss of admin control if the key was stolen. **End users** — An attacker with the admin key could see and change user accounts, contact pages, and recovery data. **Site** — Full takeover of the backend.  
- **What would be compromised:** Admin access; all user accounts, contact pages, emails, and recovery data that admin can see or change.

**3. There was no limit on how many times someone could try to log in or request recovery codes**  
- **Risk:** Attackers could try many passwords or recovery codes in a short time (e.g. thousands of attempts) to guess the right one.  
- **Impact:** **Admins** — Admin password or recovery code could be guessed. **End users** — User passwords or recovery codes could be guessed. **Site** — Abuse, spam (e.g. many “send recovery email” requests), or account takeover.  
- **What would be compromised:** Accounts whose password or code was guessed; stability of the service if abused at scale.

**4. When the server had an error, it sometimes sent technical details back to the browser**  
- **Risk:** Error messages could reveal how the system is built (e.g. database names, paths). That helps attackers plan further attacks.  
- **Impact:** **Admins and end users** — No direct leak of your data, but **the site** becomes an easier target. **Site** — Information that should stay internal is exposed.  
- **What would be compromised:** Not your personal data directly, but the site’s “secrets” about its setup, which can lead to future attacks.

**5. Messages that admins could show to users (e.g. a banner in My Account) were inserted as raw “HTML”**  
- **Risk:** If an admin account was compromised, the attacker could set a “message” that was actually code. When users opened My Account, that code could run in their browser and, for example, steal their session or change their password.  
- **Impact:** **End users** — Session hijack, password change, or other actions in their name. **Admins** — No direct impact except misuse of the feature. **Site** — Loss of user trust; possible account takeovers.  
- **What would be compromised:** User sessions and, in the worst case, control of user accounts (passwords, contact pages).

---

### Medium-risk issues (what we fixed or partly addressed)

**6. The special “setup” endpoint that can set the admin password was protected only by one secret**  
- **Risk:** If that secret was short or leaked, someone could call that endpoint and set a new admin email and password, taking over the site.  
- **Impact:** **Admins** — Loss of access; attacker becomes admin. **End users** — Attacker could see and change all user data. **Site** — Full admin takeover.  
- **What would be compromised:** Entire admin control and all data admin can access.

**7. Admin recovery code was only 6 digits**  
- **Risk:** With no limit on attempts, an attacker could try many 6-digit codes in the 10-minute window and possibly guess the right one.  
- **Impact:** **Admins** — Attacker could use recovery to set a new admin password. **End users** — No direct impact. **Site** — Admin takeover.  
- **What would be compromised:** Admin account.

**8. When an admin viewed a user’s “secrets” (e.g. to help with recovery), there was no record**  
- **Risk:** If an admin account was misused, there was no way to see that someone had looked at a user’s one-time password or recovery data.  
- **Impact:** **Admins** — No audit trail. **End users** — No way to prove their data was accessed. **Site** — No accountability.  
- **What would be compromised:** Accountability and the ability to investigate misuse.

**9. The “key” used to sign user login tokens could be misconfigured or weak**  
- **Risk:** If that key (JWT secret) was weak or different in different environments, someone could forge “I am user X” tokens and sign in as any user.  
- **Impact:** **End users** — Account takeover if tokens were forged. **Admins** — No direct impact. **Site** — Loss of user accounts and trust.  
- **What would be compromised:** User identities and all data tied to those accounts.

**10. Alert and banner messages could, in theory, run code if the message contained special characters**  
- **Risk:** If the server or user input ever sent HTML/code in a message that was then shown as “live” content, that code could run in the browser (e.g. steal session).  
- **Impact:** **End users and admins** — Session or data theft if such a message was shown. **Site** — Trust and security.  
- **What would be compromised:** Sessions and any data the session could access.

---

### What was not fixed (and why)

**11. The API that returns “secrets” (e.g. security questions and answers) still sends the full answers**  
- **Risk:** Only the logged-in user or an admin can call this. But if an admin account or a user’s token was stolen, the attacker could read those answers.  
- **Impact:** **End users** — Security answers and DOB could be exposed. **Admins** — No direct impact. **Site** — Sensitive data exposure if credentials are compromised.  
- **Why not changed:** The admin and user “Set Secrets” screens pre-fill the form from this API. Removing answers would require changing the screens so they no longer show or expect current answers (e.g. show “••••” and only allow setting new ones). That’s a design/UX choice left for later.  
- **What would be compromised if exploited:** Security-question answers and date of birth for users whose admin or token was compromised.

**12. User enumeration (check-username, check-account-email, recovery/check)** — **Remediated 2026-02-11**  
- **What we did:** All these endpoints now return generic responses: no `available`, `exists`, or `canRecover` in the response. Recovery returns a single message and question ID(s); check-username/check-account-email return `{ status: 'ok' }` for valid input. “Username taken” / “email in use” appear only when the user submits signup or profile and the server returns 409.  
- **Impact:** Account existence and recovery eligibility are no longer disclosed by these APIs.

**13. Email relay secret comparison** — **Remediated 2026-02-11**  
- **What we did:** The Vercel email relay now compares the relay secret using a constant-time comparison (SHA-256 hash of both values then `crypto.timingSafeEqual` in `email-relay/api/send.js`).  
- **Impact:** Timing attacks on the relay secret are mitigated.

**14. QR code script (CDN)** — **Remediated 2026-02-11**  
- **What we did:** The QR code script on admin, home, and myaccount now has Subresource Integrity (SRI) with sha384 and `crossorigin="anonymous"`.  
- **Impact:** If the CDN is compromised or the file is altered, the browser will reject the script.

---

## Part 2: How the fixes address the risks

| Risk | What we did | How it helps |
|------|-------------|--------------|
| Any site could talk to the API (CORS) | We restricted the API so only your real site (and your chosen localhost addresses) can use it. Other websites can’t use it from the browser. | Stops other sites from abusing your or a user’s session to call the API and read responses. |
| Admin key stored in a long-lived, readable way | We switched to “session storage” so the key is only kept for the current tab and is cleared when the tab closes. We also updated the script on contact pages to use the same. | Shorter-lived key; no long-term storage that any script could read. Reduces impact of a future script bug. |
| No limit on login or recovery attempts | We added rate limiting: only a limited number of attempts per IP per time window (e.g. so many logins per minute, so many “send recovery” per 10 minutes). | Stops brute-force guessing of passwords and recovery codes; limits abuse and spam. |
| Server errors exposed technical details | We changed the server so it only sends a short, generic message to the browser (“Something went wrong”) and logs the real error on the server. | Attackers and the public no longer see internal details that could help them. |
| Admin messages could run as code (push message XSS) | We sanitize the text of those messages before showing them, so they can’t run as code even if an admin set something malicious. | Users’ sessions and accounts are protected from malicious banner content. |
| Setup endpoint protected only by one short secret | We require the setup secret to be at least 32 characters; otherwise the endpoint refuses to run. We documented that it must be long and random. | Short or guessable setup secrets can’t be used; forces a strong secret. |
| Admin recovery code only 6 digits | We increased it to 8 digits and kept rate limiting on recovery. The admin UI and email were updated to say “8-digit code.” | Much harder to guess the recovery code even with limited attempts. |
| No record when admin views a user’s OTP | We added a server log line (“Admin OTP read” + username) when the API returns a user’s one-time password to an admin. | You can see in logs when an admin viewed a user’s OTP, for auditing. |
| JWT secret misconfiguration or weakness | We documented that the preferred secret name is JWT_SECRET and that the value must be long and random. No code change so existing setups still work. | Reduces the chance of a weak or wrong secret and of forged user logins. |
| Alert/banner messages could run code | We escape all message text before showing it in alerts and banners (admin and user site). Only our own safe bits (e.g. spinner, button) are treated as HTML. | API or user-supplied text can’t run as code in the browser. |

---

## Part 3: What was not implemented and why

- **Secrets API still returns security-question answers**  
  **Why:** The Set Secrets screens (admin and user) pre-fill from this API. Removing answers would require changing those screens (e.g. show “••••” and only allow setting new answers). Left as an optional improvement. You can still rely on access control and HTTPS; if you want to harden further, you’d change the API and the UI together.

- **User enumeration** — **Now implemented (2026-02-11):** Generic responses for check-username, check-account-email, and recovery/check; “taken”/“in use” only on submit (409).

- **Email relay secret** — **Now implemented (2026-02-11):** Constant-time compare in Vercel relay (`email-relay/api/send.js`).

---

*This summary is based on the full Security Risk Audit and the high- and medium-risk remediation work. For exact technical details, see SECURITY-RISK-AUDIT.md, HIGH-RISK-REMEDIATION-GUIDE.md, and MEDIUM-RISK-REMEDIATION-GUIDE.md.*
