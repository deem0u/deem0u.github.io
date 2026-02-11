# Restore points

Use this as a reference if you need to roll back the site or Worker to a known-good state.

---

## 2026-02-11 — Post–email divert fix & OG meta

**Git commit:** `fe4c31c` (full: `fe4c31c10f6d9fa71149511326066b75e7ed56f4`)

**State at this point:**
- Email relay: divert is **opt-in only** (emails go to real recipient unless `EMAIL_SEND_RESTRICTED` is `'true'`/`'1'` or KV divert is on).
- All main pages have Open Graph + description meta for link previews (Home, How It Works, Resources, MyAccount, Contact, Terms, Admin, edit/signup redirects).
- Context mascot header icons on How It Works, Guide to QR Codes, FAQ, MyAccount, Contact, Terms, Admin.
- DigiCon iD subject/body for OTP and email-change verification emails; docs (EMAIL-RELAY-REVIEW.md, EMAIL-RELAY-TYPES.md) updated.

**To roll back to this point:**
- **Repo (GitHub Pages):** `git checkout fe4c31c` (or `git revert` later commits), then push. Or restore from GitHub if you prefer.
- **Cloudflare Worker:** Redeploy the Worker from this commit: from `cloudflare-worker/` run `npx wrangler deploy` after checking out this commit (or use Workers dashboard to roll back to a previous deployment if you have version history).

---

*Add new entries above this line when you create another restore point.*
