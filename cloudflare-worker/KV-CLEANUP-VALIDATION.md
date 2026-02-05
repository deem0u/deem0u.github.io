# KV cleanup safeguard – validation

## Fix summary

1. **Worker:** When `getValidUsernamesFromGitHub(env)` returns an empty array (GitHub API failure, bad/missing token, wrong repo/branch), we no longer mark any user keys as orphaned. Only expired admin temp keys (`admin:recovery_code`, `admin:reset_token`) are collected. The response includes `githubUnavailable: true` when `validUsernamesCount === 0`.

2. **Admin UI:** When the KV orphans response has `githubUnavailable: true` and there are no keys to delete, the UI shows: *"Could not load user list from GitHub (check GITHUB_TOKEN and repo/branch). No user keys were marked as orphaned."*

---

## Validation scenarios

### Scenario A: GitHub returns no users (API failure / bad token)

| Step | Expected |
|------|----------|
| `getValidUsernamesFromGitHub(env)` | returns `[]` |
| `haveValidUsers` | `false` |
| User/contact/emailToFolder loops | not run |
| `orphanedKeys` | remains `[]` |
| `expiredTemp` | may contain expired admin keys only |
| Response `validUsernamesCount` | `0` |
| Response `githubUnavailable` | `true` |
| **Cleanup (dry run or delete)** | Only keys in `expiredTemp` are in `toDelete`; no user keys deleted |

### Scenario B: GitHub returns users (e.g. `['alice','bob']`)

| Step | Expected |
|------|----------|
| `getValidUsernamesFromGitHub(env)` | returns `['alice','bob']` (or similar) |
| `haveValidUsers` | `true` |
| User/contact/emailToFolder loops | run |
| `orphanedKeys` | only keys whose username (lowercased) is not in `validSet` |
| Response `githubUnavailable` | absent (not set) |
| **Cleanup** | Deletes real orphans + expired temp keys only |

### Scenario C: Admin UI – GitHub unavailable, nothing to delete

| Step | Expected |
|------|----------|
| GET `/api/admin/kv-orphans` returns `validUsernamesCount: 0`, `githubUnavailable: true`, `orphanedKeys: []`, `expiredTemp: []` | `total === 0` |
| UI | Shows error state with message: "Could not load user list from GitHub (check GITHUB_TOKEN and repo/branch). No user keys were marked as orphaned." |

### Scenario D: Admin UI – GitHub unavailable, only expired temp keys

| Step | Expected |
|------|----------|
| GET returns `githubUnavailable: true`, `orphanedKeys: []`, `expiredTemp: ['admin:recovery_code']` | `total === 1` |
| UI | Shows report with "Valid user folders: 0. Orphaned keys: 0. Expired temporary keys: 1. Total to delete: 1." and lists the key. Cleanup actions visible. |

---

## Code paths verified

- **collectKvOrphans:** `if (haveValidUsers) { ... }` wraps all user/contact/emailToFolder orphan collection. When `haveValidUsers` is false, `orphanedKeys` is never populated from user data.
- **handleGetKvOrphans:** Returns `...data` so `githubUnavailable` is included when set.
- **handleKvCleanup:** Uses `data.orphanedKeys` and `data.expiredTemp`; when GitHub is unavailable, `data.orphanedKeys` is empty, so only expired temp keys can be deleted.
- **Admin refreshKvOrphansReport:** When `d.githubUnavailable && total === 0`, shows error state with the GitHub warning message.
