# Validation audit – contact forms

Reference forms: **Add New User**, **Edit Contact Information** (admin), **User Contact Editor**.

**Context:** Required-ness differs by form. Add New User only requires User Name to create. Admin Edit has no required enforcement. User Contact Editor requires Given Names, Family Name, and Email.

---

## Current validation (as implemented)

| Field | Add New User | Edit Contact (admin) | User Contact Editor | Notes |
|-------|----------------|----------------------|---------------------|-------|
| **User Name** | `required`, `pattern="^[a-zA-Z0-9_-]{3,32}$"`, `minlength="3"`, `maxlength="32"`, proactive (blur/input), inline error | — | — | Alphanumeric, hyphens, underscores only; 3–32 chars. |
| **Given Names** | Optional. `pattern="^[a-zA-Z][a-zA-Z\s'\-.]*$"`, `maxlength="32"`, proactive (blur/input), inline error | Same | Required. Same pattern, maxlength, proactive; submit blocked if invalid. | Letters, spaces, apostrophes, hyphens and periods only; max 32 chars. Must start with letter. |
| **Family Name** | Optional. Same pattern, maxlength, proactive as Given Names | Same | Required. Same; submit blocked if invalid. | Letters, spaces, apostrophes, hyphens and periods only; max 32 chars. |
| **Email** | Optional. `type="email"`, proactive (blur/input), inline error | Same | Required. Same; submit blocked if invalid. | `type="email"`; message: "Please enter a valid email address (e.g. name@example.com)." |
| **Contact Number** | Optional. `pattern="\+[0-9]{8,20}"`, `maxlength="21"`, mask (`+` prefix, digits only, 8–20), proactive | Same | Same | Mask strips spaces; format `+` then digits only. |
| **Home Country** | Optional. Searchable select; valid only if from list. Can be cleared or left empty via “Leave empty” | Same | Same | No proactive validation. |
| **Destination Name** | Optional. `maxlength="200"` | Same | Same | Free text; no proactive validation. |
| **Destination Address** | Optional. `maxlength="200"` | Same | Same | Free text; no proactive validation. |
| **Destination Contact Number** | Optional. Same as Contact Number (mask, pattern, proactive) | Same | Same | Same inline error as Contact Number. |
| **Destination Email** | Optional. `type="email"`, proactive | Same | Same | Same message as Email. |
| **Additional Information** | Optional. `maxlength="500"`, `rows="8"` | Same | Same | Multiline; no proactive validation. |

---

## Implementation options

1. **HTML5 attributes:** `required`, `pattern`, `minlength`, `maxlength`, `type="email"` / `type="tel"`.
2. **JS on submit:** `form.checkValidity()` / `form.reportValidity()` before API calls; optional custom messages via `setCustomValidity`.
3. **Proactive validation:** `input` / `blur` listeners to validate (and optionally show inline errors) as user types or leaves a field.
4. **Masking:** Existing contact-number mask; could extend to other fields if needed.

---

## Submit handling (current)

- **Add New User:** `handleCreateUser` validates User Name via `validateFolder()` before create; blocks submit and shows inline error if invalid.
- **Edit Contact (admin):** `handleSave` does not enforce validation (admin can leave fields blank).
- **User Contact Editor:** `handleSave` validates Given Names, Family Name, and Email via `validateGivenNames` / `validateFamilyName` / `validateEmailInput` before save; blocks submit and shows inline error if any invalid.

---

## Fields to review (prompt for each)

1. **User Name** – required? pattern? min/max length? proactive?
2. **Given Names** – required (which forms)? pattern? proactive?
3. **Family Name** – required (which forms)? pattern? proactive?
4. **Email** – required (which forms)? pattern / type only? proactive?
5. **Contact Number** – required? pattern? mask? proactive?
6. **Home Country** – required? “must be from list” only? proactive?
7. **Destination Name** – any validation? proactive?
8. **Destination Address** – any validation? proactive?
9. **Destination Contact Number** – any validation? pattern? proactive?
10. **Destination Email** – any validation? pattern? proactive?
11. **Additional Information** – any validation? max length? proactive?

---

## Consistency rules

- **Add New User:** Only User Name required for create; other fields optional.
- **Edit Contact (admin):** No required enforcement; optional validation (e.g. format when provided).
- **User Contact Editor:** Required and format rules apply; validation enforced on submit.
