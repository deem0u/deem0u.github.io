# Form Descriptions — Labels, Hints, Warnings, Validation & Masks

This document describes each form’s section title, field labels, in-field text (placeholders), hints, warning text, validation rules, and input masks. The runtime labels/hints used by the app are in `form-descriptions.js`; this file is the human-readable reference and audit.

---

## My Account — Account Profile

**Section label:** Account Profile (sidebar strip); Edit Profile (inline form).  
**Description:** User-editable profile: username (URL slug), first/last name, account email; date of birth is read-only. Used for sign-in identity and contact page base URL.

| Field | Label | Placeholder / in-field text | Hint | Additional warning | Validation | Mask |
|-------|--------|-----------------------------|------|--------------------|------------|------|
| User Name | User Name * | e.g. john-smith | 3–28 characters. Letters, numbers, hyphens, underscores. Stored as lowercase (e.g. John-Smith → john-smith). Must be unique. | **Yellow box (on focus):** Changes to your User Name affect the URL of any Contact Pages already created. Any QR codes and NFC tags pointing to the old URL will need to be regenerated, reprinted, or rewritten with the new one. | Required. Pattern: `^[a-zA-Z0-9_\-]{3,28}$`. minlength 3, maxlength 28. Blur: lowercase normalisation; uniqueness/availability checked. Spaces stripped on input. | None |
| First Name | First Name | (none) | (none) | — | maxlength 32 | None |
| Last Name | Last Name | (none) | (none) | — | maxlength 32 | None |
| Account Email | Account Email * | (none) | (none) | — | Required, email format | None |
| Date Of Birth | Date Of Birth | — | — | — | Read-only (display only in edit) | — |

**Validation mechanisms:** Blur validation on User Name (format, length, lowercase); profile save validates required fields and username availability. **Field masks:** None (no space masking on User Name — spaces are stripped on input).

---

## My Account — New Contact Page Form

**Section:** Shown when "+ New contact page" is used; form in edit panel with Form Hints toggle.  
**Description:** Create a new contact page: page name, URL slug, and contact fields (names, email, phone, home country, destination details, additional information). Same form structure as Edit Contact Page; slug warning text differs for create vs edit.

| Field | Label | Placeholder / in-field text | Hint | Additional warning | Validation | Mask |
|-------|--------|-----------------------------|------|--------------------|------------|------|
| Page Name | Page Name * | Page Name | A name to identify this page on your list of Contact Pages. Must be unique amongst the list. | — | Required, maxlength 28 | None |
| Page URL | Page URL * | e.g. mypage (slug field) | A Slug for this page's URL. 3-28 characters - Letters, numbers, hyphens, underscores. Must be unique amongst your Contact Pages. | **Yellow box (on slug focus):** Create: "Once saved, future changes to the slug will affect the URL of this contact page. Any QR codes and NFC tags pointing to the old URL will need to be regenerated, reprinted, or rewritten with the new one." Edit: "Changes to the slug will affect the URL of this contact page. Any QR codes and NFC tags pointing to the old URL will need to be regenerated, reprinted, or rewritten with the new one." | Required (slug cannot be blank). pattern `^[a-zA-Z0-9_-]{3,28}$`, minlength 3, maxlength 28. Blur and submit validation. Spaces stripped on input. | None (no space masking; spaces stripped) |
| Given Names | Given Names * | (none) | Usually First and Last Name. Consider whether this needs to exactly match any formal ID. (shared row hint) | — | Required. pattern `^[a-zA-Z][a-zA-Z\s'\-.]*$`, maxlength 32. Blur/validation. | None |
| Family Name | Family Name * | (none) | (same row hint as Given Names) | — | Required. Same pattern and maxlength 32. | None |
| Email | Email * | (none) | A suitable email and contact number you have access to so that you can be reached. (shared row hint) | — | Required, email. | None |
| Contact Number | Contact Number | (none) | (same row hint as Email) | — | pattern `\+[0-9]{8,20}`, maxlength 21 | **contact-number-mask** (+digits) |
| Home Country | Home Country | Select country (trigger) | Your main country of residence. Helpful for identifying what language you might speak and any Consular services required. | — | — | None (searchable select) |
| Destination Details | Destination Details | (none) | The name, street address, contact number and email of the place where you will mostly be staying (e.g. hotel name/address and front-office phone/email). (form-descriptions.js `destination-details.hint`) | — | — | None |
| Destination Name / Address / Contact Number / Email | (per subfield) | (none) | — | — | maxlength 200 (name, address); phone pattern + maxlength 21 | contact-number-mask on phone fields |
| Additional Information | Additional Information | (none) | Optional. e.g. emergency contact, special instructions. | — | maxlength 500 | None |

**Validation mechanisms:** Required checks on Page Name, Page URL (slug), Given Names, Family Name, Email. Slug format/length and uniqueness on blur and submit. Contact number format; destination email when used. **Field masks:** contact-number-mask on Contact Number and Destination Contact Number. **Form Hints:** Toggle "Form Hints: Show/Hide" shows or hides all hints; slug warning is separate (yellow box on slug focus).

---

## My Account — Edit Contact Page Form (Contact Page form in Edit Mode)

**Section:** Same form as New Contact Page; shown when editing an existing contact page (Edit mode). Same layout and behaviour; slug warning text differs.  
**Description:** Edit an existing contact page. Same fields as New Contact Page; slug warning on focus uses the “edit” wording (URL change affects existing QR/NFC).

| Field | Label | Placeholder / in-field text | Hint | Additional warning | Validation | Mask |
|-------|--------|-----------------------------|------|--------------------|------------|------|
| Page Name | Page Name * | Page Name | A name to identify this page on your list of Contact Pages. Must be unique amongst the list. | — | Required, maxlength 28 | None |
| Page URL | Page URL * | e.g. mypage (slug field) | A Slug for this page's URL. 3-28 characters - Letters, numbers, hyphens, underscores. Must be unique amongst your Contact Pages. | **Yellow box (on slug focus):** "Changes to the slug will affect the URL of this contact page. Any QR codes and NFC tags pointing to the old URL will need to be regenerated, reprinted, or rewritten with the new one." | Same as New Contact Page (pattern, length, uniqueness). Spaces stripped on input. | None |
| Given Names … Additional Information | (same as New Contact Page) | (same) | (same) | — | (same) | (same) |

**Validation mechanisms:** Same as New Contact Page; plus slug/page-name uniqueness against existing pages. **Field masks:** Same (contact-number-mask on phone fields; no space masking on slug).

---

## Admin Dashboard — Edit Profile Modal

**Section:** Modal title "Edit Profile - &lt;username&gt;". Used to edit a user’s profile from Manage Users.  
**Description:** Admin edits a user's account username (folder/URL), first name, and last name. Renaming username updates the user folder; user continues to sign in with the same account email.

| Field | Label | Placeholder / in-field text | Hint | Additional warning | Validation | Mask |
|-------|--------|-----------------------------|------|--------------------|------------|------|
| Account Username | Account Username | e.g. john-smith | 3–32 characters: letters, numbers, hyphens, underscores. Changing this renames the user folder and URL. After rename, they sign in with the same account email (now tied to the new username). (Note: validation uses 3–28 chars; hint text says 3–32.) | — | pattern `[a-zA-Z0-9_\-]{3,28}`, minlength 3, maxlength 28. updateProfileModalState on input/blur. | None |
| First Name | First Name | First name | (none) | — | maxlength 32 | None |
| Last Name | Last Name | Last name | (none) | — | maxlength 32 | None |

**Validation mechanisms:** Input/blur drive modal state; save validates and renames user folder via API. **Field masks:** None.

---

## Admin Dashboard — Set Secrets Modal

**Section:** Modal title "Set Secrets - &lt;username&gt;". Used to set or update a user’s password, account email, DOB, and security questions.  
**Description:** Admin sets or updates a user's password (with Generate/Clear/Delete OTP), account email (with Email Verified override), date of birth, and three security questions with answers. Badges show current completion state.

| Field | Label | Placeholder / in-field text | Hint | Additional warning | Validation | Mask |
|-------|--------|-----------------------------|------|--------------------|------------|------|
| Password | Password | (empty) | (none) | — | Min 8 chars when set. Generate OTP / Clear OTP / Delete OTP actions. | None |
| Account Email | Account Email | (empty) | (none) | — | Email format. Optional "Email Verified (Admin Override)" checkbox. | None |
| Date of Birth | Date of Birth | dd/mm/yyyy | (none) | — | pattern `\d{1,2}/\d{1,2}/\d{4}`, maxlength 10, title "Format: dd/mm/yyyy" | **dob-mask** (dd/mm/yyyy) |
| Security Questions | Security Questions | Select: "- Select question -"; Answer: "Answer" | (none) | — | 3 different questions; answers 4–30 chars each, maxlength 30. Validation: "Select 3 different questions with answers (4-30 chars each), or leave all empty" / "Select 3 different questions with answers (4-30 chars each)." Reset SQ button. | None |

**Validation mechanisms:** Save validates password (if set), email, DOB format, and three distinct security questions with answers. **Field masks:** dob-mask on Date of Birth. **Other:** Badges for Password, Account Email (verified), DOB, Security Questions; Generate OTP / Clear / Delete OTP for password.

---

## Admin Dashboard — Login (Admin Key)

**Section:** Sign In screen; segmented control "Admin Key" | "Email & Password"; default mode: Admin Key.  
**Description:** Sign in to the admin dashboard using the locally stored admin key (or switch to Email & Password). Subtitle: "Enter your Admin Key to Sign In".

| Field | Label | Placeholder / in-field text | Hint | Additional warning | Validation | Mask |
|-------|--------|-----------------------------|------|--------------------|------------|------|
| Admin Key | Admin Key | Enter your admin key | Admin keys are stored locally on the device you sign in on — You will stay signed in on this device. | — | Required (client: "Please enter your admin key"; server: "Invalid admin key. Try again or use Forgot password?") | None |

**Validation mechanisms:** Submit requires non-empty key; API verifies key. **Field masks:** None. **Other:** Password show/hide toggle; "Forgot password?" links to Password Recovery.

---

## Admin Dashboard — Login (Email & Password)

**Section:** Same Sign In screen; segmented option "Email & Password". Subtitle: "Enter the Admin Email and Password to Sign In".  
**Description:** Sign in using the admin recovery email and password set in Dashboard → Account.

| Field | Label | Placeholder / in-field text | Hint | Additional warning | Validation | Mask |
|-------|--------|-----------------------------|------|--------------------|------------|------|
| Email | Email | your@email.com | (none) | — | Required (client: "Please enter your email and password."). Email format. | None |
| Password | Password | Your password | (none) | — | Required. API: "Invalid email or password." on failure. | None |

**Validation mechanisms:** Submit requires both fields; API validates credentials. **Field masks:** None.

---

## Admin Dashboard — Password Recovery

**Section:** Screen "Password Recovery"; subtitle varies by step.  
**Description:** Recover admin access: enter email → receive 6-digit code → verify code. Outcome: either display recovered password (step 3) or send reset link (step 3b). Failsafe (Cloudflare KV) shown when email relay fails.

| Step | Field | Label | Placeholder / in-field text | Hint | Additional warning | Validation | Mask |
|------|--------|--------|-----------------------------|------|--------------------|------------|------|
| 1 | Email | Email | your@email.com | (none) | — | Required, email. Button: "Send Recovery Code". | None |
| 2 | Code | Enter 6-Digit Code | 000000 | Code expires in 10 minutes | — | required, maxlength 6, pattern `[0-9]{6}`. Button: "Verify Code". | None |
| 3 | (display) | Your Admin Password | (readonly + Copy) | — | — | — | — |
| 3b | — | — | — | "We've sent a password reset link to your email. Click the link to set a new password." | — | — | — |

**Validation mechanisms:** Step 1: API sends code to email. Step 2: API verifies code; then either returns password (step 3) or sends reset link (step 3b). **Field masks:** None. **Other:** "? Back to Sign In" resets recovery state.

---

## MyAccount — Login (User Name)

**Section:** Sign In screen; segmented control "Email & Password" (default) | "User Name".  
**Description:** Sign in with User Name + Password. Subtitle when User Name mode: (set by JS, e.g. "Enter your User Name and Password").

| Field | Label | Placeholder / in-field text | Hint | Additional warning | Validation | Mask |
|-------|--------|-----------------------------|------|--------------------|------------|------|
| User Name | User Name | e.g. john-smith | (none) | — | Required. API validates username + password. | None |
| Password | Password | Enter your password | (none) | — | Required. On success may show "Set a new permanent password" (OTP flow) with New Password / Confirm Password. | None |

**Validation mechanisms:** Submit sends username + password; invalid: "Sign in failed. Please check your email and password." (shared message with email mode). **Field masks:** None. **Other:** Password show/hide toggle; "I need help Signing In" opens Access Recovery.

---

## MyAccount — Login (Email & Password)

**Section:** Same Sign In screen; default mode "Email & Password". Subtitle: "To access and edit your Digital Contact Page, enter your Account Email and Password".  
**Description:** Sign in with Account Email + Password.

| Field | Label | Placeholder / in-field text | Hint | Additional warning | Validation | Mask |
|-------|--------|-----------------------------|------|--------------------|------------|------|
| Account Email | Account Email | your@email.com | (none) | — | Required, email format. | None |
| Password | Password | Enter your password | (none) | — | Required. If user has OTP only: after sign-in, "Set a new permanent password" (New Password, Confirm Password, min 8 chars). | None |

**Validation mechanisms:** Submit validates email + password; OTP users are prompted to set permanent password. **Field masks:** None.

---

## MyAccount — Access Recovery (User Name or Email)

**Section:** Card "Access Recovery"; subtitle "Enter your User Name to recover access" or "Enter your Account Email to recover access" (toggle via pills).  
**Description:** Recover access by User Name or Account Email. Step 1: enter username or email → "Recover Access". Step 2: Account Email, Date of Birth, Security Question(s) and answer(s); optional "Send recovery link to my email". Success: one-time code sent to account email; user signs in with that code as password then sets new permanent password.

| Path | Step | Field | Label | Placeholder / in-field text | Hint | Additional warning | Validation | Mask |
|------|------|--------|--------|-----------------------------|------|--------------------|------------|------|
| Username | 1 | User Name | User Name | e.g. john-smith | (none) | — | Required. 3–28 characters. API returns recovery question. | None |
| Email | 1 | Account Email | Account Email | your@email.com | (none) | — | Required, email. | None |
| Both | 2 | Account Email | Account Email | (none) | (none) | — | Required when step 2 shown. | None |
| Both | 2 | Date of Birth | Date of Birth | dd/mm/yyyy | Format: dd/mm/yyyy | — | Required for verify. pattern dd/mm/yyyy. | **dob-mask** |
| Both | 2 | Security Q | (dynamic label) | Answer | (none) | — | 1–2 questions shown, answer maxlength 30. 4–30 chars. | None |

**Validation mechanisms:** Step 1: username 3–28 chars or valid email; API returns recovery question(s). Step 2: email, DOB, SQ answer(s); API verifies and sends OTP to account email. **Field masks:** dob-mask on Date of Birth. **Other:** Pills: "Forgot your User Name? Use Account Email instead" / "Use User Name instead". "Back to Sign In" returns to login.

---

## Home — Step 0: Sign Up (including verification)

**Section:** Card title "Sign Up". Shown after "Get Started". After submit: email verification (OTP card "Verify your email") then Step 1.  
**Description:** Collect email, first name, last name, password; then send OTP and verify email before proceeding to Create Account (Step 1).

| Field | Label | Placeholder / in-field text | Hint | Additional warning | Validation | Mask |
|-------|--------|-----------------------------|------|--------------------|------------|------|
| Email | Email | (empty) | (none; hints hidden in step0 per CSS) | — | required, email. | None |
| First Name | First Name | (none) | (none) | — | required, maxlength 32 | None |
| Last Name | Last Name | (none) | (none) | — | required, maxlength 32 | None |
| Password | Password | (none) | (none) | — | required, minlength 8. Show/hide toggle. | None |

**Verification (OTP):** Card "Verify your email". Text: "We've sent a 6-digit code to &lt;email&gt;. Enter it below." Field: "Verification code", placeholder "000000", maxlength 6, pattern `[0-9]{6}`, inputmode numeric. Buttons: "Verify", "Resend code". Success card: "Your email has been verified and your account is ready." → "Continue" to Step 1.

**Validation mechanisms:** Step 0: required email, first name, last name, password (min 8). Submit sends signup request; then OTP card shown. OTP submit verifies code; on success user proceeds to Step 1. **Field masks:** None.

---

## Home — Step 1: Create Account (including verification)

**Section:** Progress pill "1. Create Account"; card shows Account Email (read-only from Step 0), then form.  
**Description:** Create the account: User Name (folder), Date of Birth, Security Questions (3), consent checkbox. Verification (email) already done in Step 0.

| Field | Label | Placeholder / in-field text | Hint | Additional warning | Validation | Mask |
|-------|--------|-----------------------------|------|--------------------|------------|------|
| Account Email | Account Email | — (read-only display) | (none) | — | Display only from Step 0. | — |
| User Name | User Name * | (none) | Used in your contact page URL. Letters, numbers, hyphens, underscores (3–28 chars). Stored as lowercase, e.g. John-Smith → john-smith. | — | required, pattern `^[a-zA-Z0-9_-]{3,28}$`, minlength 3, maxlength 28. | None |
| Date of Birth | Date of Birth * | dd/mm/yyyy | Used for account recovery. Format: dd/mm/yyyy | — | required, pattern `\d{1,2}/\d{1,2}/\d{4}`, maxlength 10. | **dob-mask** |
| Security Questions | Security Questions * | Select: "— Select question —"; Answer: "Answer" | Select 3 different questions and provide answers (4–30 characters each). Used for account recovery. | — | 3 different questions; answers 4–30 chars, maxlength 30, required. | None |
| Consent | (checkbox) | — | I agree to the Terms of Use and Privacy Statement. (full consent text in UI.) | — | Required (checkbox must be checked). | None |

**Validation mechanisms:** User name format and uniqueness; DOB format; three distinct security questions with answers; consent required. Submit: "Create My Account". **Field masks:** dob-mask on Date of Birth. **Other:** "Start Over" clears signup state.

---

## Home — Step 2: Contact Page

**Section:** Progress pill "2. Contact Page"; card title "Step 2 — Complete Your Contact Page".  
**Description:** No data-entry form. Card instructs user to add contact details (name, email, phone, etc.) to their page now or later. Actions: **Save** (opens My Account editor in new tab), **Skip** (then "Continue to Step 3"), or after Save: "When you have finished in My Account, click below to continue" → **Continue**.

| Element | Type | Label / text | Notes |
|---------|------|----------------|-------|
| Body text | — | Add your contact details (name, email, phone, etc.) to your page. You can do this now or later. | Informational only. |
| Save | Link/button | Save | Opens editor (My Account) in new tab. |
| Skip | Button | Skip | Shows message + "Continue to Step 3". |
| Continue | Button | Continue | Shown after Save when returning; continues to Step 3. |

**Validation mechanisms:** None (no form fields). **Field masks:** None. **Placeholder:** This section documents the Step 2 screen; the actual contact page content form lives in My Account (New/Edit Contact Page Form).

---

## Cross-reference: form-descriptions.js

- **Contact page context** (My Account and Admin new/edit contact forms): labels and hints for `first-name`, `surname`, `email`, `mobile`, `home-country`, `destination-details`, `additional-info`, etc. come from `window.FORM_DESCRIPTIONS` in `form-descriptions.js`.
- **Account profile** (My Account) and **Admin Edit Profile / Set Secrets** use their own inline labels and hints in `myaccount/index.html` and `admin/index.html`; they do not use `FORM_DESCRIPTIONS` for all fields.
- **Masks:** `dob-mask` and `contact-number-mask` are implemented in the respective app scripts (e.g. myaccount `index.html`, admin `index.html`).
