# Variable Audit: Account vs Contact Page

## Summary

| Concept | Account (Profile) | Contact Page (Public) |
|---------|-------------------|------------------------|
| **Email** | `accountEmail` | `contactEmail` |
| **First/Given** | `firstName` (Account First Name) | `givenName` (Given Names) |
| **Last/Family** | `lastName` (Account Last Name) | `familyName` (Family Name) |

## Conventions Applied

- **Contact Page context**: `givenName`, `familyName`, `contactEmail` (as on the contact page labels)
- **Form keys**: `first-name` → givenName, `surname` → familyName, `email` → contactEmail (form-descriptions.js)
- **Admin userInfo display**: Only `accountEmail`, `firstName`, `lastName` (Account details for administration)
- **Page completeness** (isIncomplete): Uses `pageGivenName`, `pageFamilyName`, `pageEmail` (Contact Page content)
- **Form labels**: "Contact Page Email" where both Account and Contact context exist; form-descriptions documents mapping

---

## 1. AccountEmail vs ContactPageEmail

### Storage & semantics
- **Account Email**: KV `account_email:{username}`. Used for sign-in, recovery, account management.
- **Contact Page Email**: Stored in contact page HTML. Displayed publicly on the live page.

### Consistency
- **Admin**: `userInfo[x].accountEmail` (Account) vs `userInfo[x].email` (Contact Page). Distinct.
- **Admin Add New User form**: "Account Email" (new-account-email) vs "Contact Page Email" (new-email). Distinct.
- **Admin display**: Uses `u.accountEmail || u.email` with "(Contact Page Email)" fallback label when showing email. Correct.
- **Edit page**: Profile shows Account Email; form has Contact Page fields. Distinct.
- **Worker**: `account_email` KV vs `email` param in `generateContactPageHTML`. Distinct.

### Minor inconsistency
- Home signup sends `contactPageEmail: ''` (empty) – correct. Initial page uses Account names; Contact Page email is filled in Step 2.

---

## 2. AccountFirstName vs ContactPageGivenName

### Storage
- **Account**: KV `user_first_name:{username}`. API returns as `firstName`.
- **Contact Page**: HTML content, form key `first-name`, label "Given Names".

### Flow
- **Home signup**: "First Name" → `firstName` → stored in `user_first_name` (Account) and used for initial page. At signup, they match.
- **Admin Add New User**: "Given Names" (new-first-name) → Contact Page only. Account first name not set for admin-created users.
- **Admin userInfo**: `firstName` comes from account-profiles (Account) when available; otherwise from extractInfo (Contact Page).
- **Edit profile**: "First Name" (edit-profile-first-name) → Account only via PUT /api/profile.
- **Edit form**: "Given Names" (first-name) → Contact Page only.

### Inconsistency
- Admin `extractInfo` returns `firstName` for Contact Page "Given Names" – same property name as Account. Semantically mixed when no account profile exists.

---

## 3. AccountLastName vs ContactPageSurname

### Storage
- **Account**: KV `user_last_name:{username}`. API returns as `lastName`.
- **Contact Page**: HTML content, form key `surname`, label "Family Name".

### Inconsistency: `lastName` vs `surname`
- **Worker**: Stores `user_last_name`, account-profiles returns `lastName`, handleSignup accepts `surname`.
- **Admin userInfo**: Uses `surname` (not `lastName`).
- **Home signup**: Sends `surname: lastName` (key `surname`, value from Last Name field).
- **Edit profile**: Uses `lastName` in API body.

### Recommendation
Standardise on one of:
- **Option A**: Use `lastName` everywhere (matches Account profile, edit profile).
- **Option B**: Use `surname` everywhere (matches Contact Page form key, admin userInfo).

---

## Data flow summary

| Source | Account Email | Account First | Account Last | Contact Email | Contact Given | Contact Family |
|--------|---------------|---------------|--------------|---------------|---------------|----------------|
| KV | account_email | user_first_name | user_last_name | — | — | — |
| Contact HTML | — | — | — | mailto | Given Names | Family Name |
| Admin userInfo | accountEmail | firstName | surname | email | (in firstName) | (in surname) |
| Form keys | — | — | — | email | first-name | surname |

---

## Recommended fixes

1. **Rename admin userInfo** for clarity when displaying: prefer `accountFirstName`/`accountLastName` when showing Account profile, and keep `firstName`/`surname` as the display name (which may come from either source). Or document that `firstName`/`surname` = "display name" (Account preferred, Contact fallback).

2. **Unify lastName/surname** in the worker: either always use `lastName` (and have home send `lastName` not `surname`) or always use `surname`. Worker `handleSignup` uses `body.surname`; `account-profiles` returns `lastName`; `handlePutProfile` uses `body.lastName`. Align to one term.

3. **Admin-created users**: When admin adds a user with Given/Family names, consider also setting `user_first_name`/`user_last_name` in KV so account-profiles returns them. Currently only signup sets these.

---

## Audit update (2026-02-11)

Re-audit: variable naming and data-flow unchanged. MyAccount QR modal builds URL from `viewPageHref()` and vCard from form fields (`first-name`, `surname`, `email`, `mobile`, `home-country`, etc.) — same semantics as Contact Page; no new variables introduced.
