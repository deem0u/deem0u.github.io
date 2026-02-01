# Email Relay Setup — Step-by-Step Guide

This guide walks you through enabling **automated email sending** from your Gmail account (e.g. `deem0u.github.io@gmail.com`) so the Contact Page Editor can send transactional emails (account details, recovery codes, etc.) without using mailto links.

---

## Overview

| Component | Purpose |
|-----------|---------|
| **Email Relay** | Small serverless function (Vercel) that uses Nodemailer + Gmail SMTP to send emails |
| **Cloudflare Worker** | Calls the relay when workflows need to send email |
| **Gmail** | Sends from your address via App Password (no "less secure apps") |

**Requirements:**
- A Gmail account (e.g. `deem0u.github.io@gmail.com`)
- A Vercel account (free tier is sufficient)
- Access to Cloudflare Worker settings

---

## Part 1 — Gmail: Enable 2FA and Create App Password

Gmail no longer supports "less secure apps." You must use **2-Step Verification** and an **App Password**.

### Step 1.1 — Enable 2-Step Verification

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Sign in with the Gmail account you want to send from
3. Under **How you sign in to Google**, find **2-Step Verification**
4. Click **2-Step Verification** → **Get started** (if not already on)
5. Follow the prompts to enable 2-Step Verification (SMS or authenticator app)
6. Complete setup

### Step 1.2 — Create an App Password

1. Go back to [Google Account Security](https://myaccount.google.com/security)
2. Under **How you sign in to Google**, click **2-Step Verification**
3. Scroll down to **App passwords**
4. Click **App passwords**
5. If prompted, sign in again
6. **Select app:** choose **Mail** (or **Other** and type "Contact Page Editor")
7. **Select device:** choose **Other** and type "Vercel Email Relay"
8. Click **Generate**
9. A 16-character password appears (e.g. `abcd efgh ijkl mnop`)
10. **Copy this password immediately** — it is shown only once
11. Store it securely (e.g. in a password manager). You will need it for Part 2.

**Important:** The App Password has no spaces when you use it — remove spaces if you copy it with spaces (e.g. `abcdefghijklmnop`).

---

## Part 2 — Deploy the Email Relay on Vercel

### Step 2.1 — Create a Vercel Account

1. Go to [vercel.com](https://vercel.com)
2. Sign up (free) with GitHub, GitLab, or email
3. Verify your email if prompted

### Step 2.2 — Generate a Relay Secret

You need a random string to authenticate requests from the Worker to the relay.

**Option A — Using Node.js (if installed):**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Option B — Using OpenSSL (Mac/Linux):**
```bash
openssl rand -hex 32
```

**Option C — Online:** Use a password generator to create a 64-character hex string.

**Save this value** — you will use it in both Vercel and Cloudflare. Example: `a1b2c3d4e5f6...` (64 chars).

### Step 2.3 — Create the Email Relay Project

**Option A — Deploy from the repo (if email-relay is in your GitHub repo):**

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard) and sign in.
2. Click the **Add New...** button (top right), then **Project**.
3. On the "Import Git Repository" screen:
   - Find your repository in the list (e.g. `deem0u/deem0u.github.io` or similar).
   - Click **Import** next to it.
4. On the "Configure Project" screen:
   - **Project Name** (at the top): This is where the "name already used" error appears. Vercel pre-fills this with your repo name (e.g. `deem0u-github-io`), which may already exist.
     - **Click inside the Project Name field** and change it to something unique, for example:
       - `contact-page-email-relay`
       - `deem0u-email-relay`
       - `cpe-email-relay-2024`
     - The name must be unique across all Vercel projects. Avoid generic names like `email-relay` or `email-sender` in case others use them.
   - **Root Directory:** Click **Edit** (or the field itself). Enter `email-relay` so Vercel uses the `email-relay` subfolder as the project root. Confirm.
   - **Framework Preset:** Select **Other** from the dropdown (or leave as "Other" if that is default).
   - **Build Command:** Leave blank (or empty).
   - **Output Directory:** Leave blank.
   - **Install Command:** Leave as default (`npm install` or `yarn install`).
5. **Environment Variables** (important — add before first deploy):
   - Expand the **Environment Variables** section.
   - Add these three variables (see Step 2.4 for exact values):
     - `GMAIL_USER`
     - `GMAIL_APP_PASSWORD`
     - `RELAY_SECRET`
   - For each, select **Production**, **Preview**, and **Development** so they apply everywhere.
6. Click **Deploy**.
7. Wait for the build to finish. If it succeeds, you will see a "Congratulations" screen with your project URL.

**Option B — Deploy from local folder (Vercel CLI):**

1. Open a terminal (PowerShell, Command Prompt, or Git Bash).
2. Navigate to the `email-relay` folder. Example (adjust the path to match your machine):
   ```bash
   cd d:\Users\Daniel\Cursor\Workspaces\Proj.DigitalLuggageTags\repos\Github\deem0u.github.io\email-relay
   ```
3. Install Vercel CLI if needed:
   ```bash
   npm i -g vercel
   ```
4. Log in to Vercel:
   ```bash
   vercel login
   ```
   Follow the browser prompt to authenticate.
5. Deploy:
   ```bash
   vercel
   ```
6. Answer the prompts:
   - **Set up and deploy?** → Yes
   - **Which scope?** → Your account (usually the default)
   - **Link to existing project?** → No
   - **What's your project's name?** → Enter a unique name (e.g. `contact-page-email-relay`). If you get "name already used", try another (e.g. `cpe-email-relay`).
   - **In which directory is your code located?** → `./` (press Enter)
7. After the first deploy, add environment variables in the Vercel Dashboard (see Step 2.4).
8. Redeploy so the new variables are applied:
   ```bash
   vercel --prod
   ```

---

**If you see "The specified name is already used for a different Git repository":**

- This means the **Project Name** Vercel wants to use is already taken (by you or someone else).
- **Fix:** Click into the **Project Name** field on the "Configure Project" screen and change it to something unique.
- Examples that often work: `contact-page-email-relay`, `deem0u-email-relay`, `cpe-relay-2024`, `my-email-relay-deem0u`.
- The name only affects your Vercel URL (e.g. `https://contact-page-email-relay.vercel.app`). It does not affect how the relay works. Use whatever URL Vercel gives you as `EMAIL_RELAY_URL` in Cloudflare.

### Step 2.4 — Add Environment Variables in Vercel

If you did not add these during the initial deploy (Step 2.3), add them now:

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard).
2. Click on your email relay project (the name you chose, e.g. `contact-page-email-relay`).
3. Click the **Settings** tab at the top.
4. In the left sidebar, click **Environment Variables**.
5. For each variable below:
   - In the **Key** field, enter the exact name (case-sensitive).
   - In the **Value** field, enter the value (no quotes).
   - Under **Environment**, select all three: **Production**, **Preview**, **Development**.
   - Click **Save**.

| Key | Value | Notes |
|-----|-------|-------|
| `GMAIL_USER` | `deem0u.github.io@gmail.com` | Your Gmail address (the one you send from). |
| `GMAIL_APP_PASSWORD` | Your 16-character App Password | From Part 1. Remove spaces; use `abcdefghijklmnop` format. |
| `RELAY_SECRET` | Your random secret from Step 2.2 | The 64-character hex string. Must match what you will put in Cloudflare. |

6. After adding all three, **redeploy** so they take effect:
   - Go to the **Deployments** tab.
   - Find the latest deployment, click the **⋯** (three dots) menu on the right.
   - Click **Redeploy**.
   - Confirm. Wait for the deployment to finish.

### Step 2.5 — Note Your Relay URL

After deployment, your function will be available at:
```
https://YOUR-PROJECT-NAME.vercel.app/api/send
```

**Where to find it:**
1. In the Vercel project, look at the top of the page for **Domains** or the project URL.
2. Or go to **Deployments** → click the latest deployment → the URL is shown (e.g. `contact-page-email-relay-xxx.vercel.app`).
3. Your relay endpoint is that URL plus `/api/send`.

Examples:
- If your project is `contact-page-email-relay`, the relay URL is:  
  `https://contact-page-email-relay.vercel.app/api/send`
- If Vercel added a suffix: `contact-page-email-relay-abc123.vercel.app`, use:  
  `https://contact-page-email-relay-abc123.vercel.app/api/send`

**Important:** Include `https://` and `/api/send`. Do not add a trailing slash.

**Save this URL** — you will add it as `EMAIL_RELAY_URL` in the Cloudflare Worker in Part 3.

### Step 2.6 — Test the Relay (Optional)

You can test with curl (replace placeholders):
```bash
curl -X POST https://YOUR-PROJECT.vercel.app/api/send \
  -H "Content-Type: application/json" \
  -H "X-Relay-Secret: YOUR_RELAY_SECRET" \
  -d '{"to":"your-email@example.com","subject":"Test","text":"Hello from relay"}'
```

If successful, you should receive the email and get a JSON response like `{"success":true,"id":"..."}`.

---

## Part 3 — Configure the Cloudflare Worker

### Step 3.1 — Add Worker Secrets

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages**
2. Click your `contact-page-editor` worker (or your worker name)
3. **Settings** → **Variables and Secrets**
4. Under **Environment Variables** (or **Secrets**), click **Add**
5. Add two **Secrets**:

| Name | Value |
|------|-------|
| `EMAIL_RELAY_URL` | Your Vercel relay URL, e.g. `https://YOUR-PROJECT.vercel.app/api/send` |
| `EMAIL_RELAY_SECRET` | The same `RELAY_SECRET` value you used in Vercel |

6. Click **Encrypt** (for each) and **Save**

### Step 3.2 — Deploy Worker with sendEmail Helper

The Worker code must include the `sendEmail` helper. This is already present in the latest `worker.js`. If you are updating an older Worker:

1. Ensure your `cloudflare-worker/worker.js` includes the `sendEmail` function (see SETUP-GUIDE Part F)
2. Deploy the Worker:
   ```bash
   cd cloudflare-worker
   npx wrangler deploy
   ```

---

## Part 4 — Verify End-to-End

### Step 4.1 — Send a Test Email from the Worker

A temporary test can be added to confirm the flow. In the Worker, you could add a test route (admin-only) that calls `sendEmail`. For example, an admin could trigger a test from the dashboard.

**Or** use the curl test in Part 2.6 to verify the relay works. If that succeeds, the Worker’s `sendEmail` helper will work the same way when workflows call it.

### Step 4.2 — Remove Any Test Route

If you added a temporary test route to the Worker, remove it before going to production.

---

## Summary Checklist

| Step | Action | Done |
|------|--------|------|
| 1.1 | Enable 2-Step Verification on Gmail | ☐ |
| 1.2 | Create Gmail App Password, save it | ☐ |
| 2.2 | Generate RELAY_SECRET, save it | ☐ |
| 2.3 | Deploy email-relay to Vercel | ☐ |
| 2.4 | Add GMAIL_USER, GMAIL_APP_PASSWORD, RELAY_SECRET in Vercel | ☐ |
| 2.5 | Note the relay URL | ☐ |
| 2.6 | (Optional) Test relay with curl | ☐ |
| 3.1 | Add EMAIL_RELAY_URL and EMAIL_RELAY_SECRET to Worker | ☐ |
| 3.2 | Deploy Worker with sendEmail helper | ☐ |

---

## Troubleshooting

| Issue | Check |
|-------|-------|
| 401 Unauthorized | RELAY_SECRET matches in both Vercel and Worker |
| 500 from relay | GMAIL_USER and GMAIL_APP_PASSWORD set correctly; App Password has no spaces |
| Gmail "Less secure app" | Use App Password, not your normal Gmail password |
| Emails in spam | Send a few test emails; avoid spammy content; Gmail may need to warm up |
| Worker can't reach relay | EMAIL_RELAY_URL correct; no trailing slash; Vercel function deployed |

---

## Security Notes

- **Never** commit `GMAIL_APP_PASSWORD`, `RELAY_SECRET`, or `EMAIL_RELAY_SECRET` to Git
- Store secrets only in Vercel and Cloudflare environment variables
- Use a strong, random `RELAY_SECRET` (64+ characters)
- The relay validates every request via `X-Relay-Secret`; only the Worker should know this value
