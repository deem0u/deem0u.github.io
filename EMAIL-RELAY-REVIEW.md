# Relay emails — review and edit reference

All transactional emails are sent by the **Cloudflare Worker** via the **Vercel email relay**. Content is defined in `cloudflare-worker/worker.js`. This document includes **subject** and **full body text** (plain and HTML) for each email so you can review and request edits.

**Placeholders** (replaced at send time): `{code}`, `{recoveryCode}`, `{resetLink}`, `{otp}`, `{username}`, `{viewLink}`, `{editUrl}`, `{name}`, `{email}`, `{enquiryType}`, `{message}`.

---

## 1. Admin recovery — verification code (step 1)

**Trigger:** Admin enters email on recovery flow → `POST /api/recovery/check-by-email`  
**To:** Stored admin email  
**Format:** Text only (no HTML)

**Subject**
```
Admin Dashboard - Recovery Code
```

**Body (plain text)**
```
Your 8-digit recovery code is: {recoveryCode}

This code expires in 10 minutes.

If you did not request this, please ignore this email.
```

**Location in worker:** search for `Admin Dashboard - Recovery Code` (around line 908).

---

## 2. Admin recovery — password reset link (step 2)

**Trigger:** Admin submits correct recovery code → reset link sent  
**To:** Stored admin email  
**Format:** Text only (no HTML)

**Subject**
```
Admin Dashboard - Password Reset Link
```

**Body (plain text)**
```
Click the link below to set a new password. The link expires in 1 hour.

{resetLink}

If you did not request this, please ignore this email.
```

**Location in worker:** search for `Admin Dashboard - Password Reset Link` (around line 893).

---

## 3. User signup — email verification OTP

**Trigger:** `POST /api/otp/send` (signup verify email)  
**To:** Account email for user  
**Format:** Text + HTML

**Subject**
```
Your verification code - Digital Contact Page
```

**Body (plain text)**
```
Your 6-digit verification code is: {code}

This code expires in 10 minutes. If you did not request this, you can ignore this email.

Please check your spam/junk folder if you don't see this email.
```

**Body (HTML)**
```html
<p>Your 6-digit verification code is: <strong>{code}</strong></p>
<p>This code expires in 10 minutes. If you did not request this, you can ignore this email.</p>
<p>Please check your spam/junk folder if you don't see this email.</p>
```

**Location in worker:** search for `Your verification code - Digital Contact Page` (around line 1180).

---

## 4. User signup success — account details

**Trigger:**
- After signup at Step 4 Summary (OTP verified only) via `POST /api/signup-success-email`
- On successful admin verification override of account email via Admin dashboard
- On successful user verification via My Account page

**To:** accountEmail from request  
**Format:** Text + HTML (Arial/Helvetica, email-friendly)

**Subject**
```
DigiCon iD - {username} - Account Details
```

**Body (plain text)** — mirrors Step 4 Summary (no email verification status; no “summary”/“copy sent” lines)
```
Below are details related to your account you should keep handy.

Profile details
	• User Name: {username}
	• First Name: {firstName}
	• Last Name: {lastName}
	• Account Email: {accountEmail}
	• Date of Birth: {dob}

Contact Page & QR's
	• Page URL: {viewLink}   (or "—" and "To be setup later in My Account")

Next steps
Click the "Go to My Account" button below where you can:
	• Add new or view and edit all your contact pages
	• Generate the QR codes for your Contact Pages (URL and vCard)
	• Edit your profile details including your username
	• Change your login password and reset your security questions

If you did not Sign Up or make these account changes please contact us at deem0u.github.io@gmail.com
```

**Body (HTML)** — same structure, rich text with font-family Arial, Helvetica, sans-serif; user content escaped.

**Location in worker:** search for `DigiCon iD -` and `Account Details` (handleSignupSuccessEmail).

---

## 5. Contact form (public)

**Trigger:** `POST /api/contact` — public form on Contact page  
**To:** CONTACT_FORM_RECIPIENT (deem0u.github.io@gmail.com)  
**Format:** Text + HTML (name, email, enquiryType, message are escaped in HTML)

**Subject**
```
Contact form: {enquiryType} from {name}
```

**Body (plain text)**
```
Name: {name}
Email: {email}
Enquiry type: {enquiryType}

Message:
{message}
```

**Body (HTML)**  
*(Name, email, enquiryType, and message are HTML-escaped; line breaks in message become &lt;br&gt;.)*
```html
<p><strong>Name:</strong> {name}</p>
<p><strong>Email:</strong> <a href="mailto:{email}">{email}</a></p>
<p><strong>Enquiry type:</strong> {enquiryType}</p>
<p><strong>Message:</strong></p>
<p>{message with newlines as &lt;br&gt;}</p>
```

**Location in worker:** search for `Contact form:` (around lines 1244–1246).

---

## 6. User one-time password (MyAccount)

**Trigger:** Admin “Send OTP”, user recovery success, or admin set-secrets that emails OTP  
**To:** User’s account email  
**Format:** Text + HTML  
*(Same body used in multiple places in worker: ~2494, 3316, 3340, 3875.)*

**Subject**
```
DigiCon iD - Your one-time password
```

**Body (plain text)**
```
Your one-time sign-in password is: {otp}

Use this to sign in at MyAccount (with your Account Email or User Name). You will then be asked to set a new permanent password.

If you did not request this, please get in touch via the Contact page.
```

**Body (HTML)**
```html
<p>Your one-time sign-in password is: <strong>{otp}</strong></p>
<p>Use this to sign in at MyAccount (with your Account Email or User Name). You will then be asked to set a new permanent password.</p>
<p>If you did not request this, please get in touch via the Contact page.</p>
```

**Location in worker:** search for `DigiCon iD - Your one-time password` (multiple places: ~2494, 3316, 3340, 3875).

---

## 7. User profile — email change verification code

**Trigger:** Initiate email change → code sent to **new** email (`POST /api/profile/verify-email-change` or related)  
**To:** New account email  
**Format:** Text + HTML

**Subject**
```
DigiCon iD - Verify your new email
```

**Body (plain text)**
```
Your 6-digit verification code is: {code}

This code expires in 10 minutes. Use it in MyAccount to complete your email change.

If you did not request this, please sign in and change your password.
```

**Body (HTML)**
```html
<p>Your 6-digit verification code is: <strong>{code}</strong></p>
<p>This code expires in 10 minutes. Use it in MyAccount to complete your email change.</p>
<p>If you did not request this, please sign in and change your password.</p>
```

**Location in worker:** search for `DigiCon iD - Verify your new email` (around line 3423).

---

## Summary table

| # | Type                    | Subject (pattern)                                          |
|---|-------------------------|------------------------------------------------------------|
| 1 | Admin recovery code     | Admin Dashboard - Recovery Code                           |
| 2 | Admin reset link        | Admin Dashboard - Password Reset Link                     |
| 3 | User OTP (verify email) | Your verification code - Digital Contact Page             |
| 4 | Signup success           | DigiCon iD - {username} - Account Details                  |
| 5 | Contact form             | Contact form: {enquiryType} from {name}                    |
| 6 | User one-time password   | DigiCon iD - Your one-time password                        |
| 7 | Email change verify      | DigiCon iD - Verify your new email                         |

---

**To request edits:** specify which email(s) by number or name, and what to change (subject and/or body text and/or body HTML). Placeholders like `{code}`, `{username}` must remain in the worker; only the surrounding wording is edited.
