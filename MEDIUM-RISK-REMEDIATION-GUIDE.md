# Medium-Risk Issues — Remediation Summary

This document explains each **medium-risk** finding in plain language: what the risk is, how it was (or wasn’t) addressed, and what actually changes for you.

---

## Implemented

---

### 1. Internal endpoint (ADMIN_SETUP_SECRET)

**Risk in plain language**  
You have a special API that only people with the “setup secret” can use. It lets them set or change the admin email, password, and admin key without logging in. If that secret is short or easy to guess (e.g. `"secret123"`), someone could try many possibilities, guess it, and then take over the admin account and all user data.

**How it was addressed**  
The Worker now **refuses** to run that endpoint if the secret you configured in Cloudflare is **shorter than 32 characters**. It returns a clear error telling you to set a long, random value. So a short or guessable secret can no longer be used; you’re forced to use something strong.

**Material impacts and changes**  
- **If your current ADMIN_SETUP_SECRET is already 32+ characters:** Nothing changes; the endpoint keeps working as before.  
- **If it’s shorter than 32 characters:** The endpoint will start returning an error until you go to Cloudflare (Workers → your Worker → Settings → Variables and Secrets), edit **ADMIN_SETUP_SECRET**, and set it to a long random string (e.g. 32+ characters from a password generator).  
- **New setups:** When you first add **ADMIN_SETUP_SECRET**, use a long random value from the start so you never hit this error.

---

### 2. Admin recovery code (8-digit, higher entropy)

**Risk in plain language**  
When an admin forgets their password, they get a **recovery code** by email and enter it in the dashboard to set a new password. The code used to be **6 digits** (like a PIN). That’s only about a million possible combinations. Without limits on how many times someone can try, an attacker could try codes over and over and eventually guess the right one within the 10 minutes the code is valid.

**How it was addressed**  
- The recovery code is now **8 digits** (100 million combinations), so guessing is far harder.  
- **Rate limiting** was already added for the recovery flow (limited attempts per IP per 10 minutes), so even 8 digits can’t be brute-forced in practice.  
- The admin dashboard (recovery step and “set new password” modal) was updated so the input accepts 8 digits and the on-screen text says “8-digit code.” The email sent to the admin now says “Your 8-digit recovery code is: …”.

**Material impacts and changes**  
- **Admins:** When you use “Forgot password” and request a recovery code, you will receive an **8-digit** code (e.g. `12345678`) instead of 6. You must enter all 8 digits in the dashboard.  
- **Email:** The message in the email is updated to say “8-digit”; the code itself is longer.  
- **No change** to how often you can request a code or how long it’s valid (10 minutes); only the length and strength of the code changed.

---

### 3. Admin OTP read (audit trail)

**Risk in plain language**  
When an admin opens “Set Secrets” for a user who has a one-time password (OTP) set, the API sends that OTP back so the admin can see it (e.g. to tell the user over the phone). There was no record that the admin had seen it. If an admin account was ever compromised, you wouldn’t know if someone had been reading users’ OTPs.

**How it was addressed**  
Whenever the API returns a user’s OTP to an admin (when they load that user’s secrets), the Worker now **logs a line** to the server: “Admin OTP read” plus the username. That log appears in Cloudflare’s logs (dashboard or `wrangler tail`), so you have an audit trail of when an admin viewed a user’s OTP.

**Material impacts and changes**  
- **Admins:** No change to what you see or do; you still see the OTP in the Set Secrets screen when it’s set.  
- **Operational:** If you need to check “who viewed which user’s OTP and when,” you can look in Cloudflare Workers → your Worker → Logs (or use `wrangler tail`). The log line is: `Admin OTP read <username>`.  
- **Privacy/audit:** You can periodically review logs to confirm OTP access is appropriate.

---

### 4. JWT secret configuration

**Risk in plain language**  
When a user signs in, the site gets a “token” (JWT) that proves they’re that user. That token is signed with a **secret** that only your server knows. The code was written to use either a secret called **JWT_SECRET** or one called **SESSION_SECRET**. Having two names can cause confusion: you might set one in production and the other in a different environment, so tokens don’t work where you expect. Also, if the secret is weak or left at a default, someone could forge tokens and sign in as any user.

**How it was addressed**  
No code logic was changed (the Worker still accepts **JWT_SECRET** or **SESSION_SECRET** so existing setups keep working). The **wrangler.toml** and comments were updated to state clearly that **JWT_SECRET** is the **preferred** name and that the value must be long and random (e.g. 32+ characters). That way anyone configuring the Worker knows which secret to set and how strong it should be.

**Material impacts and changes**  
- **If you already have JWT_SECRET or SESSION_SECRET set:** Nothing breaks; behaviour is unchanged.  
- **When you next configure or rotate secrets:** Prefer **JWT_SECRET** and use a long random value. If you like, you can remove **SESSION_SECRET** and use only **JWT_SECRET** so there’s a single name everywhere.  
- **New deployments:** Set **JWT_SECRET** (not **SESSION_SECRET**) and use a strong value from the start.

---

### 5. Alert and banner XSS (showAlert / showStatusBanner)

**Risk in plain language**  
In the Admin and My Account pages, messages (e.g. “Invalid password”, “Saved”, or errors from the API) are shown in small alert boxes or banners. Those messages were inserted into the page using **innerHTML**, which treats the text as HTML. If the API or any user input ever contained HTML or script (e.g. because of a bug or a malicious response), that code could run in the browser. An attacker could then steal the admin key or user token, or change what the user sees.

**How it was addressed**  
- **My Account:** A small **escapeHtml** function was added. Every message passed to **showAlert** and **showStatusBanner** is now escaped before it’s put into the page. So even if the API sent something like `<script>...</script>`, it would be shown as harmless text, not executed. For “loading” style messages (e.g. “Setting password…”), the spinner is added in code, not from the message string.  
- **Admin:** The same idea: **showAlert** now escapes the message. Where we need to add a “Retry” button next to the message, we use an optional fourth parameter so only the message is escaped and the button is safe HTML.  
So all user- and API-derived text in alerts and banners is now safe; only our own fixed HTML (e.g. spinner, button) is rendered as HTML.

**Material impacts and changes**  
- **Users and admins:** You won’t notice any difference. Messages still look the same (e.g. “Invalid email or password”, “Contact page deleted”).  
- **Behavioural:** If the API ever returned a message that contained `<` or `>` or quotes, you would previously have seen broken layout or (in the worst case) unexpected script. Now you’ll just see those characters as normal text (e.g. “&lt;” on screen if the message literally contained “<”). In normal use, API messages don’t contain HTML, so there’s no visible change.

---

## Not implemented (optional or deferred)

---

### 6. Secrets API returns security-question answers

**Risk in plain language**  
When you (or an admin) open “Set Secrets” for a user, the API sends back their account email, date of birth, and their **security questions and answers** (e.g. “What is your mother’s maiden name?” and the answer). That data is only sent to someone who is already logged in as that user or as an admin. But if an admin account was compromised or a user’s token was stolen, the attacker could call this API and get those answers. Security answers are often reused or guessable, so exposing them can help an attacker elsewhere or help them pass recovery checks.

**Why it wasn’t changed**  
The Admin and My Account “Set Secrets” screens **pre-fill** the form with data from this API, including the current security answers, so the user or admin can see and edit them. If we stopped sending answers in the API, we would have to change the frontend so it no longer expects or shows those answers (e.g. show “••••••••” or “Answer set” and only let them type **new** answers when saving). That would be a noticeable UX change and would require careful updates in both admin and myaccount.

**Material impacts if you implement it later**  
- **API:** GET `/api/secrets/:username` would return only **questionId** for each of the 3 questions (no **answer** text). DOB and account email could stay as they are, or you could also mask DOB depending on how strict you want to be.  
- **Admin and My Account:** When opening Set Secrets, the form would show the three **questions** (from questionId) but the **answer** fields would be empty or show a placeholder like “••••••••” or “Set to change.” Saving would still send the new answers; you just wouldn’t **display** or **receive** the old ones.  
- **Trade-off:** Better protection of sensitive data vs. losing the ability to “see” the current answers in the form. Many sites never show existing security answers and only allow setting new ones; that’s the model you’d move to.

**Options**  
- **A)** Implement the above (API stops returning answers; admin + myaccount stop pre-filling answer text).  
- **B)** Keep current behaviour and rely on access control, HTTPS, and protecting admin keys and user tokens. Document that answers are sensitive and only available to the same user or admin.

---

### 7. User enumeration

**Risk in plain language**  
Some parts of your site let anyone (without logging in) ask “does this username exist?” or “does this email have an account?” or “can this account use recovery?”. The API answers with things like “available: true/false” or “exists: true, canRecover: false”. That lets someone systematically try many usernames or emails and build a list of who has an account. That’s called “user enumeration.” It can help attackers target real accounts (e.g. for phishing or password guessing) or learn who’s on your platform.

**Why it wasn’t fully “fixed”**  
Those endpoints exist for normal use: e.g. the signup form checks “is this username taken?” and the recovery flow checks “does this email have an account that can recover?”. So we didn’t remove them. We **did** add **rate limiting** so that a single IP can’t fire off thousands of checks in a short time; that makes bulk enumeration much harder and was the main mitigation.

**Material impacts of current state**  
- **Users:** No change. Signup and recovery still work the same; you still get “username taken” or “we’ll send an email if that account exists.”  
- **Attackers:** They can still get “exists” vs “doesn’t exist” for a given username/email, but only at a **limited rate** (so building a huge list quickly is impractical).

**Optional further hardening**  
You could change the **wording** and **responses** so they don’t reveal whether an account exists. For example: always say “If an account exists for that email, you will receive instructions” and always return the same kind of response, whether the account exists or not. That would require changing both the API responses and the frontend copy (and possibly the recovery flow UX) so users still understand what to do. That’s a design and UX choice, not done here.

---

### 8. Email relay secret (constant-time compare)

**Risk in plain language**  
Your Worker sends emails through a Vercel “relay” and proves it’s allowed to do so by sending a shared **secret** in a header. The relay checks that header by comparing it to the stored secret character by character. In theory, an attacker could measure **how long** the comparison takes and use tiny timing differences to guess the secret one character at a time (a “timing attack”). In practice, if the secret is long and random, this is very hard to exploit and usually not a real-world concern.

**Why it wasn’t changed**  
The relay code lives in your **Vercel** project (email-relay), not in the Worker. Changing it would mean updating the relay to use a “constant-time” comparison (so the time doesn’t depend on how many characters match). For a long random secret, the practical risk is low, so no change was made.

**Material impacts**  
- **None today.** Emails and relay keep working as before.  
- **If you want to harden later:** In the Vercel relay, replace the normal string comparison with a constant-time one (e.g. using a crypto library’s timing-safe compare). You’d need to do that in the email-relay code; the Worker doesn’t need to change.

---

## Quick reference

| Item                         | Status        | Action for you |
|-----------------------------|---------------|----------------|
| ADMIN_SETUP_SECRET length   | Enforced      | Set secret ≥ 32 chars in Cloudflare. |
| Recovery code 8-digit       | Done          | None; use 8-digit code from email. |
| Admin OTP read log          | Done          | Check Cloudflare logs when auditing. |
| JWT_SECRET                  | Documented    | Prefer JWT_SECRET; use long random value. |
| showAlert / showStatusBanner| Escaped       | None. |
| Secrets API answers         | Not changed   | Optional: strip answers + update admin/myaccount UI. |
| User enumeration            | Rate limited  | Optional: generic messages + UX changes. |
| Email relay timing          | Not changed   | Optional: constant-time compare in Vercel relay. |
