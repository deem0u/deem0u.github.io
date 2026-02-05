# KV cleanup & case-sensitivity audit

This document records which parts of the worker rely on username casing and confirms the KV orphan cleanup is safe and consistent.

## 1. Where case matters

### KV (Cloudflare)
- **Keys are case-sensitive.** `account_email:johndoe` and `account_email:JohnDoe` are different keys.
- **Who writes keys:**
  - **Signup:** `username` is lowercased; all user keys use lowercase (e.g. `account_email:${username}`).
  - **Admin create contact page:** Uses `usernameTrim = username.trim().toLowerCase()` for all KV keys and for the value of `account_email_to_folder:...`. GitHub path uses original `username` (so folder can be `JohnDoe` while KV uses `johndoe`).

So in practice, **user KV keys are written with lowercase usernames**. The only case-preserving value is the GitHub folder name (e.g. `user/JohnDoe/`).

### GitHub
- **Paths are case-sensitive.** `user/JohnDoe/index.html` ≠ `user/johndoe/index.html`.
- `getValidUsernamesFromGitHub(env)` returns folder names **as returned by the API** (e.g. `JohnDoe` or `johndoe`).

### Auth (JWT + URL)
- **validateAuth:** `payload.username === username` (strict equality). So the username in the request path must match the JWT exactly.
- **Login** sets JWT with lowercase `username` (from `usernameParam.toLowerCase()` or from `account_email_to_folder:` value, which is stored lowercase). So the **canonical** username in auth is lowercase.
- **Profile / page APIs** use `username` from the URL as-is for KV lookups. If the frontend uses the same username as in the JWT (lowercase), everything matches. If someone used a different case in the URL, KV lookups could miss (e.g. empty profile).

So the system effectively assumes **username in API paths = lowercase**, matching JWT and KV.

## 2. KV orphan cleanup – what we do

- **validSet:** Built from `getValidUsernamesFromGitHub` with **lowercased** names:  
  `validSet = new Set(validUsernames.map(x => (x || '').toLowerCase()))`.  
  So a GitHub folder `JohnDoe` is treated as valid for the user `johndoe` in KV.
- **User-prefix keys** (e.g. `account_email:`, `user_password_hash:`): We take the suffix (the part after the prefix), **lowercase it**, and check `validSet.has(suffix)`. So we never treat a key as orphaned just because of case (e.g. `account_email:johndoe` and folder `JohnDoe` both count as valid).
- **account_email_to_folder:** We read the **raw** value from KV (e.g. `johndoe` or, in theory, `JohnDoe`). We only use the **lowercased** value for the valid-set check: `validSet.has(usernameLower)`. For the “current email” check we use the **raw** value to build the key: `get('account_email:' + rawUsername)`. So we don’t mark an entry as orphaned when the folder exists but casing differs, and we don’t miss the `account_email:` key because KV keys are case-sensitive.

So the cleanup is **effective** (correct set of prefixes, case-insensitive matching against GitHub) and **safe** (no false orphans for `account_email_to_folder` or other user keys due to casing).

## 3. Other code that already handles case

- **handleDebugUser:** Tries both `u` and `uLower` for every KV get, so it works for any casing.
- **handleGetAccountSetupStatuses:** Uses `lowerToOriginal` and tries both `canonical` and `uLower` for KV gets, so it’s case-tolerant.
- **collectKvUserKeys:** Normalizes input to lowercase and lists keys with lowercase prefix; compares folder from `account_email_to_folder` with `(folder || '').trim().toLowerCase() === u`. Consistent with cleanup.

## 4. Code that assumes one canonical case (no breakage from cleanup)

- **validateAuth:** Strict `payload.username === username`. Frontend is expected to send the same case as in the JWT (lowercase).
- **handleGetProfile / handlePutProfile:** Use `username` from URL as-is for KV. Expected to be lowercase from JWT.
- **handleUserCreatePage / handleDeletePage / handleUpdatePage:** Use `username` from URL for KV and for GitHub paths. Same expectation.

The KV cleanup does **not** change how auth or these handlers work; it only changes which keys are considered orphaned. Because we use lowercase for the valid-set and raw username only for the actual KV key in `account_email_to_folder`, we don’t delete keys that belong to a valid user.

## 5. Optional future improvement

To make the app more robust to URL casing (e.g. `/api/profile/JohnDoe` vs `/api/profile/johndoe`), you could:
- In **validateAuth**, compare `(payload.username || '').toLowerCase() === (username || '').toLowerCase()`.
- In **handleGetProfile** / **handlePutProfile** (and similar), resolve the canonical username once (e.g. from JWT or by trying both cases against KV) and use that for all KV operations.  
That would be a separate change; the current cleanup does not depend on it and does not break anything.
