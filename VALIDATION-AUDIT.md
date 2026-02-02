# Validation audit – contact forms

Reference forms: **Add New User** (admin), **Edit Contact Information** (admin), **User Contact Editor**, **Home signup** (Create Your Account), **Set Secrets** (admin and edit modals).

**Context:** Required-ness differs by form. Add New User only requires User Name. Admin Edit has no required enforcement. User Contact Editor requires Given Names, Family Name, and Email. Home signup requires User Name, Account Email, DOB, 3 Security Questions + answers, and consent. Set Secrets (admin) allows all empty; Set Secrets (edit) requires at least one of Account Email, DOB, or 3 SQ.

---

## Current validation (as implemented)

### Contact information fields

| Field | Add New User | Edit Contact (admin) | User Contact Editor | Notes |
|-------|----------------|----------------------|---------------------|-------|
| **User Name** | `required`, `pattern="^[a-zA-Z0-9_-]{3,32}$"`, `minlength="3"`, `maxlength="32"`, proactive (blur/input), inline error | — | — | Alphanumeric, hyphens, underscores only; 3–32 chars. |
| **Account Email** | Optional. No `required`. Not same as Contact Page Email. | — | — | For account management & recovery. Distinct from Contact Page Email. |
| **Contact Page Email** | Optional. `type="email"`, proactive (blur/input), inline error | Optional. Same | Required. `type="email"`, proactive; submit blocked if invalid. | Variable: contactEmail. Shown on live contact page. Label: Contact Page Email. |
| **Given Names** | Optional. `pattern="^[a-zA-Z][a-zA-Z\s'\-.]*$"`, `maxlength="32"`, proactive | Same | Required. Same pattern, maxlength, proactive; submit blocked if invalid. | Variable: givenName. Letters, spaces, apostrophes, hyphens, periods; max 32; must start with letter. |
| **Family Name** | Optional. Same as Given Names | Same | Required. Same; submit blocked if invalid. | Variable: familyName. Same rules as Given Names. |
| **Contact Number** | Optional. `pattern="\+[0-9]{8,20}"`, `maxlength="21"`, mask, proactive | Same | Same | Mask: `+` prefix, digits only, 8–20. |
| **Home Country** | Optional. Searchable select; from list or "Leave empty" | Same | Same | No proactive validation. |
| **Destination Name** | Optional. `maxlength="200"` | Same | Same | Free text. |
| **Destination Address** | Optional. `maxlength="200"` | Same | Same | Free text. |
| **Destination Contact Number** | Optional. Same as Contact Number | Same | Same | Mask, pattern, proactive. |
| **Destination Email** | Optional. `type="email"`, proactive | Same | Same | Same message as Email. |
| **Additional Information** | Optional. `maxlength="500"`, `rows="8"` | Same | Same | Multiline; no proactive validation. |

### Home signup (Create Your Account)

| Field | Required | Validation |
|-------|----------|------------|
| **User Name** | Yes | `required`, `pattern="^[a-zA-Z0-9_-]{3,32}$"`, `minlength="3"`, `maxlength="32"`, proactive, inline error. API check for uniqueness. |
| **Account Email** | Yes | `required`, `type="email"`, proactive. API check that email not already in use. |
| **Date of Birth** | Yes | `required`, `pattern="\d{1,2}/\d{1,2}/\d{4}"`, placeholder dd/mm/yyyy. `validateDob` / `normalizeDob`; d 1–31, mo 1–12, y 1900–2100. |
| **Security Questions** | Yes (3) | 3 distinct questions required; each answer 4–30 characters. `validateSecretAnswer`; proactive (blur/input). |
| **Consent** | Yes | Checkbox; must be checked to submit. |

### Set Secrets modal

**Admin:** All fields optional. Can save with all empty (clears secrets).  
**Edit (user):** At least one of Account Email, DOB, or 3 Secret Questions required.

| Field | Required | Validation |
|-------|----------|------------|
| **Account Email** | No | Optional. When provided: `validateEmailStrict` (stricter than `type="email"`). Proactive (blur/input). API check for uniqueness (excluding current user). |
| **Date of Birth** | No | Optional. When provided: dd/mm/yyyy, `validateDob`. Blur/input proactive. Empty allowed (no validation on blur). |
| **Secret Questions** | No | Optional. When provided: must be exactly 3 distinct questions with answers 4–30 chars each. Admin: "or leave all empty". Edit: at least one of Account Email, DOB, or 3 SQ required overall. `validateSecretAnswer` on blur/input. |

---

## Implementation options

1. **HTML5 attributes:** `required`, `pattern`, `minlength`, `maxlength`, `type="email"` / `type="tel"`.
2. **JS on submit:** `form.checkValidity()` / `form.reportValidity()` before API calls; custom validation functions.
3. **Proactive validation:** `input` / `blur` listeners; inline error elements.
4. **Masking:** Contact-number mask; DOB mask (dd/mm/yyyy) in Set Secrets and signup.
5. **`validateEmailStrict`:** Used for Account Email (Set Secrets, and implicitly via API for signup). Stricter than `type="email"` per RFC-style rules.

---

## Submit handling (current)

- **Add New User:** `handleCreateUser` validates User Name via `validateFolder()` before create; blocks submit and shows inline error if invalid. Account Email and Contact Page Email optional.
- **Edit Contact (admin):** `handleSave` does not enforce validation; admin can leave fields blank.
- **User Contact Editor:** `handleSave` validates Given Names, Family Name, and Contact Page Email; blocks submit and shows inline error if any invalid.
- **Home signup:** Validates User Name (including uniqueness), Account Email (including in-use check), DOB, 3 Security Questions + answers, consent before API call. Blocks submit on any failure.
- **Set Secrets (admin):** `saveSecrets` allows saving with all empty (clears secrets). When Account Email provided, `validateEmailStrict`. When 3 SQ provided, must be exactly 3 complete or all empty ("or leave all empty").
- **Set Secrets (edit):** `saveEditSecrets` requires at least one of Account Email, DOB, or 3 Secret Questions. When provided, validates format.

---

## Fields to review (prompt for each)

1. **User Name** – required? pattern? min/max length? proactive?
2. **Account Email** vs **Contact Page Email** – required (which forms)? `validateEmailStrict` vs `type="email"`?
3. **Given Names** – required (which forms)? pattern? proactive?
4. **Family Name** – required (which forms)? pattern? proactive?
5. **Date of Birth** – required? format? proactive? allow empty on blur?
6. **Security Questions** – required? 3 distinct? answer length 4–30? allow partial/empty?
7. **Contact Number** – required? pattern? mask? proactive?
8. **Home Country** – required? "must be from list" only? proactive?
9. **Destination fields** – any validation? proactive?
10. **Additional Information** – any validation? max length? proactive?

---

## Consistency rules

- **Add New User:** Only User Name required; Account Email and Contact Page Email optional.
- **Edit Contact (admin):** No required enforcement; format validation when provided.
- **User Contact Editor:** Given Names, Family Name, Email required; validation enforced on submit.
- **Home signup:** User Name, Account Email, DOB, 3 Security Questions + answers, consent required.
- **Set Secrets:** Admin can save with all empty. Edit requires at least one of Account Email, DOB, or 3 SQ. When provided, strict format checks. Secret Questions: either 3 complete or all empty (no partial).
