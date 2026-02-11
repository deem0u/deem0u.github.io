# Email relay — types and elements

All transactional emails are sent by the **Cloudflare Worker** via the **Vercel email relay** (Nodemailer + Gmail SMTP). The relay accepts `to`, `subject`, `html`, and `text`; it uses a fixed **From** address: `"Contact Page Editor" <GMAIL_USER>` (where `GMAIL_USER` is the env var in Vercel).

When **email divert** is on (e.g. `EMAIL_SEND_RESTRICTED` is `'true'` or `'1'`, or KV `site:divert_all_global` or per-user `divert_email:username`), user-facing emails are sent to `EMAIL_RESTRICTION_RECIPIENT` with subject prefixed `[DEV] (would go to: …)`.

---

## 1. Admin recovery — verification code (step 1)

| Element | Value |
|--------|--------|
| **Trigger** | `POST /api/recovery/check-by-email` — admin enters email, backend sends 8-digit code (no OTP in response). |
| **To** | Stored admin email (`admin:email` in KV). |
| **Subject** | `Admin Dashboard - Recovery Code` |
| **Text** | `Your 8-digit recovery code is: {recoveryCode}\n\nThis code expires in 10 minutes.\n\nIf you did not request this, please ignore this email.` |
| **HTML** | Not sent (text only). |
| **Divert** | No `username` passed; divert is by global `EMAIL_SEND_RESTRICTED` ('true'/'1') or KV only. |

---

## 2. Admin recovery — password reset link (step 2)

| Element | Value |
|--------|--------|
| **Trigger** | Same endpoint after admin submits correct recovery code; backend generates reset token and sends link. |
| **To** | Stored admin email (`admin:email`). |
| **Subject** | `Admin Dashboard - Password Reset Link` |
| **Text** | `Click the link below to set a new password. The link expires in 1 hour.\n\n{resetLink}\n\nIf you did not request this, please ignore this email.` |
| **HTML** | Not sent (text only). |
| **Divert** | Same as above. |

---

## 3. User signup — email verification OTP

| Element | Value |
|--------|--------|
| **Trigger** | `POST /api/otp/send` — body: `{ username, folder? }`. User requests 6-digit code to verify account email. |
| **To** | Account email for that user (`account_email:{username}`). |
| **Subject** | `Your verification code - Digital Contact Page` |
| **Text** | `Your 6-digit verification code is: {code}\n\nThis code expires in 10 minutes. If you did not request this, you can ignore this email.\n\nPlease check your spam/junk folder if you don't see this email.` |
| **HTML** | `<p>Your 6-digit verification code is: <strong>{code}</strong></p><p>This code expires in 10 minutes. …</p><p>Please check your spam/junk folder …</p>` |
| **Divert** | Yes — `username` passed to `sendEmail`, so can be diverted per user or globally. |

---

## 4. User signup success — account details

| Element | Value |
|--------|--------|
| **Trigger** | `POST /api/signup-success-email` — body: `{ username, accountEmail, firstName?, lastName? }`. Called after signup flow (e.g. after OTP verify or skip) to send “welcome + details” email. |
| **To** | `accountEmail` from request. |
| **Subject** | `Your Digital Contact Page - {username} - Account Details` |
| **Text** | Bullet list: User Name, Digital Contact Page URL; numbered steps “HOW TO UPDATE…”; My Account URL; note to contact deem0u.github.io@gmail.com for account deletion. |
| **HTML** | Same content: `<p>…</p><ul><li>User Name</li><li>Contact Page URL (link)</li></ul><p><strong>HOW TO UPDATE…</strong></p><ol>…</ol><p>If you wish to have your account deleted…</p>` |
| **Divert** | Yes — `username` passed. |

---

## 5. Contact form (public)

| Element | Value |
|--------|--------|
| **Trigger** | `POST /api/contact` — body: `{ name, email, enquiryType, message }`. Public form on Contact page. |
| **To** | Fixed: `CONTACT_FORM_RECIPIENT` (`deem0u.github.io@gmail.com`). |
| **Subject** | `Contact form: {enquiryType} from {name}` |
| **Text** | `Name: {name}\nEmail: {email}\nEnquiry type: {enquiryType}\n\nMessage:\n{message}` |
| **HTML** | `<p><strong>Name:</strong> {name}</p><p><strong>Email:</strong> <a href="mailto:…">…</a></p><p><strong>Enquiry type:</strong> …</p><p><strong>Message:</strong></p><p>{message with \n → <br>}</p>` (all user content escaped). |
| **Divert** | No `username`; only global divert applies. |

---

## 6. User recovery — one-time password (MyAccount)

| Element | Value |
|--------|--------|
| **Trigger** | Multiple flows that issue a one-time sign-in password: (a) Admin “Send OTP” for a user (`POST /api/admin/send-otp`), (b) User recovery by email/DOB/secrets (`POST /api/recovery/check-by-email` → success path), (c) Admin set-secrets flow that sets OTP and emails it. All send the same email. |
| **To** | User’s account email (`account_email:{username}`), or in admin-send-otp case the email from KV or request body. |
| **Subject** | `DigiCon iD - Your one-time password` |
| **Text** | `Your one-time sign-in password is: {otp}\n\nUse this to sign in at MyAccount (with your Account Email or User Name). You will then be asked to set a new permanent password.\n\nIf you did not request this, please get in touch via the Contact page.` |
| **HTML** | `<p>Your one-time sign-in password is: <strong>{otp}</strong></p><p>Use this to sign in at MyAccount …</p><p>If you did not request this, please get in touch via the Contact page.</p>` |
| **Divert** | Yes where `username` is passed (user recovery and admin set-secrets). Admin send-otp does not pass username in one code path but does in another; see worker. |

---

## 7. User profile — email change verification code

| Element | Value |
|--------|--------|
| **Trigger** | `POST /api/profile/verify-email-change` (or the endpoint that initiates email change) — user requests to change account email; backend stores pending new email and sends 6-digit code to the **new** address. |
| **To** | New account email (the one user is changing to). |
| **Subject** | `DigiCon iD - Verify your new email` |
| **Text** | `Your 6-digit verification code is: {code}\n\nThis code expires in 10 minutes. Use it in MyAccount to complete your email change.\n\nIf you did not request this, please sign in and change your password.` |
| **HTML** | `<p>Your 6-digit verification code is: <strong>{code}</strong></p><p>This code expires in 10 minutes. Use it in MyAccount to complete your email change.</p><p>If you did not request this, please sign in and change your password.</p>` |
| **Divert** | Yes — `username` passed. |

---

## Summary table

| # | Type | To | Subject (pattern) |
|---|------|-----|-------------------|
| 1 | Admin recovery code | admin:email | Admin Dashboard - Recovery Code |
| 2 | Admin reset link | admin:email | Admin Dashboard - Password Reset Link |
| 3 | User OTP (verify email) | account_email:username | Your verification code - Digital Contact Page |
| 4 | Signup success / account details | accountEmail | Your Digital Contact Page - {username} - Account Details |
| 5 | Contact form | CONTACT_FORM_RECIPIENT | Contact form: {enquiryType} from {name} |
| 6 | User one-time password | account_email or body | DigiCon iD - Your one-time password |
| 7 | Email change verification | new account email | DigiCon iD - Verify your new email |

---

## Relay API contract (Worker → Vercel)

- **Method:** POST  
- **Headers:** `Content-Type: application/json`, `X-Relay-Secret: <EMAIL_RELAY_SECRET>`  
- **Body:** `{ to, subject, html?, text? }`  
  - At least one of `html` or `text` is required in practice (relay falls back to text from html if text missing).  
- **From:** Set by relay to `"Contact Page Editor" <GMAIL_USER>`.
