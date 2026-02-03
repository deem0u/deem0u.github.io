# Contact Page Editor — Setup Guide

**From-scratch setup guide.** Use this when you need to deploy the entire system anew: what to obtain, where to enter it, and what artefacts go where.

---

## What You're Building

- **Admin Dashboard** — Manage users, set secrets, grant/revoke edit access, send account details via email
- **Home Page** — Self-service account creation for new users
- **Contact Editor** — Users sign in with User Name + Edit Key to edit their page; Access Recovery for forgot key
- **Backend (Cloudflare Worker)** — API for signup, auth, recovery, page CRUD, secrets, keys
- **Storage** — GitHub (pages content) + Cloudflare KV (keys, secrets, admin)
- **Email Relay** (optional) — Vercel serverless function using Nodemailer + Gmail SMTP; enables automated emails (account details, recovery, etc.) from your Gmail

---

## Information Checklist

Before starting, you need to obtain:

| What | Where to get it | Used for |
|------|-----------------|----------|
| **GitHub username** | Your GitHub account | Repo owner, URLs |
| **GitHub Personal Access Token** | GitHub → Settings → Developer settings → Tokens | Worker writes to your repo |
| **Cloudflare account** | https://dash.cloudflare.com/sign-up | Workers + KV |
| **KV Namespace ID** | Cloudflare → Workers & Pages → KV → Create namespace | Worker storage |
| **Worker URL** | After deploying (e.g. `https://contact-page-editor.YOUR-SUBDOMAIN.workers.dev`) | Frontend API calls |
| **Contact email** | Your choice | "Contact me" in account details, Email Me link |
| **Admin key + recovery email** | You choose at first-time setup | Admin access |
| **Gmail App Password** | Google Account → Security → 2-Step Verification → App passwords | Email relay (sends from your Gmail) |
| **Vercel account** | https://vercel.com | Hosts the email relay |
| **Email relay URL + secret** | After deploying relay; generate secret | Worker calls relay to send emails |

---

## Placeholders Reference

Use this section to find where to obtain each value, what it looks like, and every location to replace it.

### 1. `YOUR_GITHUB_USERNAME`

**What it is:** Your GitHub account username (lowercase, no spaces).

**Where to obtain:** 
- Log in to GitHub → click your avatar (top right) → your username is shown (e.g. `deem0u`)
- Or visit `https://github.com/settings/profile` — Username field

**What it looks like:** Lowercase letters, numbers, hyphens. Examples: `deem0u`, `jane-doe`, `myorg`

**Where to replace (search for `deem0u` — replace with your username):**

| File | Search for | Replace with |
|------|------------|--------------|
| `cloudflare-worker/worker.js` | `owner: 'deem0u'` | `owner: 'YOUR_GITHUB_USERNAME'` |
| `cloudflare-worker/worker.js` | `repo: 'deem0u.github.io'` | `repo: 'YOUR_GITHUB_USERNAME.github.io'` (or your Pages repo name) |
| `account-details-content.js` | `https://deem0u.github.io/` | `https://YOUR_GITHUB_USERNAME.github.io/` |
| `account-details-content.js` | `https://deem0u.github.io/edit/` | `https://YOUR_GITHUB_USERNAME.github.io/edit/` |
| `admin/index.html` | `https://deem0u.github.io/edit/` | `https://YOUR_GITHUB_USERNAME.github.io/edit/` |
| `admin/index.html` | `https://deem0u.github.io/` | `https://YOUR_GITHUB_USERNAME.github.io/` |
| `home/index.html` | `https://deem0u.github.io/edit/` | (3 occurrences: nav, Contact Editor button) |
| `home/index.html` | `https://deem0u.github.io/home/` | (1 occurrence: I'll do it later button) |
| `home/index.html` | `https://deem0u.github.io/` | (PAGES_URL) |
| `home/index.html` | `deem0u.github.io/john-smith/` | (in form hint text) |
| `edit/index.html` | `https://deem0u.github.io/edit/` | (3 occurrences: nav, recovery button) |
| `edit/index.html` | `https://deem0u.github.io/` | (PAGES_URL) |
| `edit/index.html` | `https://deem0u.github.io/${folder}/` | (view-page-link href — keep `${folder}`) |
| `terms-and-privacy/index.html` | `https://deem0u.github.io/edit/` | (nav link) |
| `form-descriptions.js` | `deem0u.github.io/<strong>john-smith</strong>/` | `YOUR_GITHUB_USERNAME.github.io/<strong>john-smith</strong>/` |

---

### 2. `YOUR_WORKER_URL`

**What it is:** The full URL of your deployed Cloudflare Worker.

**Where to obtain:**
- After creating and deploying the Worker (Part A3, A5)
- Shown on the Worker overview page, or in the URL when you're editing it
- Format: `https://WORKER_NAME.YOUR_ACCOUNT_SUBDOMAIN.workers.dev`
- Example: `https://contact-page-editor.deem0u.workers.dev` (if Worker name is `contact-page-editor` and your Cloudflare account subdomain is `deem0u`)

**What it looks like:** Full URL, no trailing slash. Starts with `https://`, ends with `.workers.dev`

**Where to replace (search for `contact-page-editor.deem0u.workers.dev` or `const API =`):**

| File | Search for | Replace with |
|------|------------|--------------|
| `admin/index.html` | `const API = 'https://contact-page-editor.deem0u.workers.dev';` | `const API = 'https://YOUR-WORKER-URL';` |
| `home/index.html` | `const API = 'https://contact-page-editor.deem0u.workers.dev';` | Same |
| `edit/index.html` | `const API = 'https://contact-page-editor.deem0u.workers.dev';` | Same |

---

### 3. `YOUR_KV_NAMESPACE_ID`

**What it is:** The unique ID of your Cloudflare KV namespace.

**Where to obtain:**
- Cloudflare Dashboard → **Workers & Pages** → **KV** → **Create a namespace**
- After creating, the ID is shown in the namespace list (right column)
- Or click the namespace → the ID is in the URL and on the details page

**What it looks like:** 32-character hexadecimal string. Example: `6cb625208ddb4313b95972ca16693098`

**Where to replace (search for `6cb625208ddb4313b95972ca16693098` or `id =`):**

| File | Search for | Replace with |
|------|------------|--------------|
| `cloudflare-worker/wrangler.toml` | `id = "6cb625208ddb4313b95972ca16693098"` | `id = "YOUR_KV_NAMESPACE_ID"` |

*Note: If you use the Cloudflare dashboard to create the Worker and bind KV manually, you can skip editing `wrangler.toml`.*

---

### 4. `YOUR_CONTACT_EMAIL`

**What it is:** The email address users contact you at (e.g. for account deletion, support, takedown notices).

**Where to obtain:** You choose any email you control (Gmail, Outlook, custom domain, etc.).

**What it looks like:** Valid email format, e.g. `you@example.com`

**Where to replace (search for `deem0u.github.io@gmail.com`):**

| File | Search for | Replace with |
|------|------------|--------------|
| `account-details-content.js` | `deem0u.github.io@gmail.com` | `YOUR_CONTACT_EMAIL` (2 occurrences: plain text and HTML body) |
| `admin/index.html` | `mailto:deem0u.github.io@gmail.com` | `mailto:YOUR_CONTACT_EMAIL` (Email Me nav link) |
| `home/index.html` | `mailto:deem0u.github.io@gmail.com` | `mailto:YOUR_CONTACT_EMAIL` (Email Me nav link) |
| `edit/index.html` | `mailto:deem0u.github.io@gmail.com` | `mailto:YOUR_CONTACT_EMAIL` (Email Me nav link) |
| `edit/index.html` | `email deem0u.github.io@gmail.com` | `email YOUR_CONTACT_EMAIL` (2 occurrences: recovery error messages) |
| `terms-and-privacy/index.html` | `deem0u.github.io@gmail.com` | `YOUR_CONTACT_EMAIL` (3 occurrences: mailto links and body text) |

---

### 5. GitHub Personal Access Token (secret, not a placeholder in files)

**What it is:** A token that lets the Worker read/write your GitHub repo.

**Where to obtain:**
- GitHub → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)**
- **Generate new token (classic)**
- Name: e.g. `Contact Page Editor`
- Expiration: your choice
- Scopes: check **repo** (full control)
- **Generate** → copy immediately (shown only once)

**What it looks like:** Starts with `ghp_` followed by ~40 alphanumeric characters. Example: `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

**Where to enter:** Cloudflare Worker → **Settings** → **Variables and Secrets** → **Add** → Name: `GITHUB_TOKEN`, Value: (paste token). **Never** put this in code or commit it.

---

### 6. `branch` (usually `main`)

**What it is:** The Git branch your GitHub Pages repo uses.

**Where to obtain:** Check your repo’s default branch (usually `main` or `master`).

**Where it appears:** `cloudflare-worker/worker.js` → `branch: 'main'`. Change only if your repo uses a different default branch.

---

### 7. Email Relay (optional — for automated emails)

**What it is:** Enables the Worker to send emails programmatically from your Gmail (e.g. `deem0u.github.io@gmail.com`) instead of using mailto links.

**Where to obtain:**
- **Gmail App Password:** Google Account → Security → 2-Step Verification → App passwords → Generate (for Mail / Other)
- **RELAY_SECRET:** Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` or `openssl rand -hex 32`
- **EMAIL_RELAY_URL:** After deploying the `email-relay` folder to Vercel (e.g. `https://your-project.vercel.app/api/send`)

**Where to enter:**
- **Vercel** (email-relay project): Environment Variables → `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `RELAY_SECRET`
- **Cloudflare Worker:** Settings → Variables and Secrets → `EMAIL_RELAY_URL`, `EMAIL_RELAY_SECRET` (same value as `RELAY_SECRET`)

**Full step-by-step:** See [EMAIL-SETUP.md](EMAIL-SETUP.md).

---

### Quick find-and-replace summary

| Search (replace all) | Replace with |
|----------------------|--------------|
| `deem0u` | Your GitHub username |
| `deem0u.github.io` | `YOUR_USERNAME.github.io` (in URLs and text) |
| `contact-page-editor.deem0u.workers.dev` | Your Worker hostname, e.g. `myworker.mysubdomain.workers.dev` (keeps existing `https://` in the string) |
| `deem0u.github.io@gmail.com` | Your contact email |
| `6cb625208ddb4313b95972ca16693098` | Your KV namespace ID (in `wrangler.toml` only) |

*Use with caution: verify each match before replacing. Some occurrences may need manual adjustment (e.g. template literals).*

---

## Part A — Cloudflare Setup

### A1. Create Cloudflare Account
1. Go to https://dash.cloudflare.com/sign-up
2. Sign up and verify email

### A2. Create KV Namespace
1. Cloudflare → **Workers & Pages** → **KV**
2. **Create a namespace**
3. Name: `contact-editor-keys` (or any name)
4. **Add**
5. **Copy the Namespace ID** (e.g. `6cb625208ddb4313b95972ca16693098`) — you need this for `wrangler.toml`

### A3. Create Worker
1. **Workers & Pages** → **Create** → **Create Worker**
2. Name: `contact-page-editor` (or any; your URL will include it)
3. **Deploy**
4. **Edit code** → delete all → paste contents of `cloudflare-worker/worker.js`
5. **Save and deploy**

### A4. Configure Worker

**Bind KV:**
1. Worker → **Settings** → **Bindings**
2. **Add** → **KV Namespace**
3. Variable name: `EDIT_KEYS_KV` (exact)
4. Select your namespace
5. **Save**

**Add secrets:**
1. **Settings** → **Variables and Secrets**
2. **Add** → **Secret**
3. Name: `GITHUB_TOKEN`
4. Value: your GitHub Personal Access Token (with `repo` scope)
5. **Encrypt** → **Save**
6. *(Optional, for automated email)* Add `EMAIL_RELAY_URL` and `EMAIL_RELAY_SECRET` — see [Part F](#part-f--email-relay-setup-optional)

### A5. Note Your Worker URL
After deploy, your worker URL is shown, e.g.:
```
https://contact-page-editor.YOUR-SUBDOMAIN.workers.dev
```
Replace `YOUR-SUBDOMAIN` with your Cloudflare account subdomain. **Save this** — you need it for the frontend.

---

## Part B — GitHub Setup

### B1. Create GitHub Personal Access Token
1. GitHub → **Settings** → **Developer settings** → **Personal access tokens**
2. **Generate new token (classic)**
3. Name: `Contact Page Editor`
4. Expiration: your choice
5. Scopes: **repo** (full)
6. **Generate**
7. **Copy the token** (starts with `ghp_`) — used in A4 above

### B2. Create or Use GitHub Pages Repo
- For `username.github.io` Pages: create repo `username.github.io` (replace `username` with your GitHub username)
- Ensure GitHub Pages is enabled (Settings → Pages → Source: main branch)

---

## Part C — Configure Your Copy

Before uploading, edit these values so they match your setup.

### C1. Worker — `cloudflare-worker/worker.js`

Near the top, update `CONFIG`:
```javascript
const CONFIG = {
  owner: 'YOUR_GITHUB_USERNAME',   // e.g. 'deem0u'
  repo: 'YOUR_GITHUB_USERNAME.github.io',  // or your Pages repo name
  branch: 'main'
};
```

### C2. Worker — `cloudflare-worker/wrangler.toml`

Update the KV namespace ID:
```toml
[[kv_namespaces]]
binding = "EDIT_KEYS_KV"
id = "YOUR_KV_NAMESPACE_ID"   # From A2
```

### C3. Frontend — API URL

Update the API base URL in **three files** (replace with your Worker URL from A5):

| File | Location | Change |
|------|----------|--------|
| `admin/index.html` | Search for `const API =` | `const API = 'https://YOUR-WORKER-URL';` |
| `home/index.html` | Search for `const API =` | Same |
| `edit/index.html` | Search for `const API =` | Same |

### C4. Frontend — Base URLs and Contact Email

**`account-details-content.js`** (root):
```javascript
const PAGES_URL = 'https://YOUR_GITHUB_USERNAME.github.io/';
const EDITOR_URL = 'https://YOUR_GITHUB_USERNAME.github.io/edit/';
```
And replace `deem0u.github.io@gmail.com` with your contact email in:
- The plain-text body string (`contact me at ...`)
- The HTML body string (`mailto:...`)

### C5. Frontend — Base URL and Navigation Links

Search for `deem0u.github.io` and `https://deem0u.github.io/` across the site. Replace with your base URL, e.g. `https://YOUR_GITHUB_USERNAME.github.io/`.

Files to update:
- `admin/index.html` — nav links, Email Me
- `home/index.html` — nav, Contact Editor button
- `edit/index.html` — nav, recovery links
- `terms-and-privacy/index.html` — nav
- `form-descriptions.js` — folder hint example (e.g. `deem0u.github.io/john-smith/` → `YOUR_GITHUB_USERNAME.github.io/john-smith/`)

---

## Part D — Artefacts to Deploy

### D1. Cloudflare Worker

| Source | Action |
|--------|--------|
| `cloudflare-worker/worker.js` | Paste into Worker code editor (or use `npx wrangler deploy`) |
| `cloudflare-worker/wrangler.toml` | Used by `wrangler deploy`; otherwise configure KV binding and secrets in dashboard |

### D2. Email Relay (optional)

| Source | Action |
|--------|--------|
| `email-relay/` | Keep in repo; deploy to Vercel as separate project (or import repo with root dir `email-relay`). See [EMAIL-SETUP.md](EMAIL-SETUP.md). |
| `EMAIL-SETUP.md` | Keep in repo root; reference for email relay setup. |

### D3. GitHub Pages (deem0u.github.io or your repo)

Upload these files preserving the folder structure:

| Source file | Destination in repo |
|-------------|---------------------|
| `styles.css` | Root: `styles.css` |
| `account-details-content.js` | Root: `account-details-content.js` |
| `countries-data.js` | Root: `countries-data.js` |
| `form-descriptions.js` | Root: `form-descriptions.js` |
| `admin/index.html` | `admin/index.html` |
| `edit/index.html` | `edit/index.html` |
| `edit/edit-secrets.js` | `edit/edit-secrets.js` |
| `home/index.html` | `home/index.html` |
| `terms-and-privacy/index.html` | `terms-and-privacy/index.html` |

**Reserved folder names** (do not use for user pages): `admin`, `edit`, `signup`, `home`, `add`, `terms-and-privacy`

**Optional:** Copy an existing user folder (e.g. `chriscam/`) as a template for new users, or create users via Admin “Add New User” or Home page signup.

---

## Part E — First-Time Setup

1. Go to `https://YOUR_GITHUB_USERNAME.github.io/admin/`
2. You should see the setup screen (not sign-in)
3. Enter an **admin key** (password) — store it safely
4. Enter your **recovery email** — used to recover admin key if forgotten
5. Click **Complete Setup**

**Done.** You can now:
- Sign in with your admin key
- Add users (Admin form or Home signup)
- Set secrets, grant access, send account details via email

---

## Part F — Email Relay Setup (Optional)

Enables automated email sending from your Gmail (account details, recovery codes, etc.). Without this, the site uses mailto links (user's email client).

**Detailed steps:** See [EMAIL-SETUP.md](EMAIL-SETUP.md) for the full walkthrough.

**Summary:**
1. Gmail: Enable 2-Step Verification, create App Password
2. Deploy `email-relay` folder to Vercel (or as subfolder of your repo with root dir set)
3. Add Vercel env vars: `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `RELAY_SECRET`
4. Add Worker secrets: `EMAIL_RELAY_URL` (e.g. `https://your-project.vercel.app/api/send`), `EMAIL_RELAY_SECRET` (same as above)
5. Redeploy Worker

The Worker includes a `sendEmail()` helper. Workflow integrations (signup, recovery, etc.) can be added later.

---

## Verification

| Check | How |
|-------|-----|
| Worker live | Visit `https://YOUR-WORKER-URL` — may show 404, but no connection error |
| Admin loads | `https://YOUR_GITHUB_USERNAME.github.io/admin/` shows setup or sign-in |
| Home loads | `https://YOUR_GITHUB_USERNAME.github.io/home/` shows hero + Get Started |
| Edit loads | `https://YOUR_GITHUB_USERNAME.github.io/edit/` shows Sign In |

---

## Daily Usage Summary

- **Manage users** — Admin → Manage Users: Add, Set Secrets, Grant/Revoke, Delete, Send via Email
- **New badge** — Users with a new Edit Key who haven’t had “Send via Email” yet
- **Edit pages** — Admin → Edit Pages, or users via Contact Editor
- **Access Recovery** — Edit page → “I need help Signing In” for users who forgot Edit Key
- **Recover admin** — Admin → Forgot password? → enter recovery email → get OTP by email → enter OTP → get reset link by email → set new password; or sign in with **Email & password** if you set a password. **Failsafe:** see *Failsafe: Retrieve admin key via Cloudflare* below if you lose both key and email access.

---

## Troubleshooting

| Issue | Check |
|-------|-------|
| Connection error | API URL correct in admin, home, edit? Worker deployed? |
| Invalid admin key | Use Forgot Key? with recovery email |
| KV not configured | KV namespace created and bound as `EDIT_KEYS_KV` |
| GITHUB_TOKEN error | Secret set in Worker; token has `repo` scope |
| Users not appearing | User folders have `index.html`; names not reserved |
| Pages not updating | GitHub Pages can take 1–2 minutes; hard refresh |
| Email relay 401 | `RELAY_SECRET` matches in Vercel and Worker |
| Email relay 500 | `GMAIL_USER`, `GMAIL_APP_PASSWORD` set in Vercel; App Password has no spaces |
| Emails not sending | Email relay URL correct in Worker; Vercel function deployed; see [EMAIL-SETUP.md](EMAIL-SETUP.md) |

---

## Failsafe: Retrieve admin key via Cloudflare

If **email login and recovery were not successful** and you no longer have a copy of the admin key (and it was not stored locally), you can still retrieve it from Cloudflare KV:

1. **Log in to Cloudflare** — https://dash.cloudflare.com/
2. **Workers & Pages** → select your Worker (e.g. `contact-page-editor`) → **Settings** → **Variables and Secrets** — note the KV namespace name (e.g. `EDIT_KEYS_KV`).
3. **Workers & Pages** → **KV** → open the namespace that is bound to your Worker.
4. In the namespace, find the key **`admin:key`**. Its **Value** is your admin key (plain text).
5. Copy that value and use it to sign in at `https://YOUR_GITHUB_USERNAME.github.io/admin/` (Admin key field). Save it somewhere safe and optionally set a new password (Dashboard → Account → Save password) and/or use Dashboard → Account → Save key to store it on this device.

This works because the admin key is stored in KV; only you (with Cloudflare account access) can read it. After recovering, consider setting a password for email sign-in and keeping a backup of the admin key in a password manager.

---

## Quick Reference

| What | URL (replace YOUR_GITHUB_USERNAME) |
|------|-----------------------------------|
| Admin Dashboard | `https://YOUR_GITHUB_USERNAME.github.io/admin/` |
| Home | `https://YOUR_GITHUB_USERNAME.github.io/home/` |
| Contact Editor | `https://YOUR_GITHUB_USERNAME.github.io/edit/` |
| User page | `https://YOUR_GITHUB_USERNAME.github.io/USERNAME/` |
| Cloudflare | https://dash.cloudflare.com/ |
| Email setup (detailed) | [EMAIL-SETUP.md](EMAIL-SETUP.md) in repo |