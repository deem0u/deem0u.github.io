# Email Relay — Next Steps (Beginner-Friendly)

You've created the Vercel project `digital-contact-page-relay`. Follow these steps in order. Take your time; each step is broken down in detail.

---

## Step 1 — Add Environment Variables in Vercel

Environment variables are secret settings (like passwords) that your relay needs to send email. You enter them once in Vercel; the relay uses them when it runs.

### 1.1 — Open Your Project in Vercel

1. Open a web browser and go to: **https://vercel.com**
2. Sign in if you are not already signed in.
3. You should see a dashboard with a list of projects.
4. Find the project named **digital-contact-page-relay**.
5. **Click on the project name** (the text itself, not any buttons). This opens the project.

### 1.2 — Go to Settings

1. At the top of the project page, you will see several tabs: **Overview**, **Deployments**, **Analytics**, **Settings**, etc.
2. Click the **Settings** tab.
3. The page will show different options in a left-hand menu.

### 1.3 — Open Environment Variables

1. In the left-hand menu, look for **Environment Variables**.
2. Click **Environment Variables**.
3. You will see a section where you can add Key/Value pairs. There may already be a form or an **Add** button.

### 1.4 — Add the First Variable (GMAIL_USER)

1. Find the **Key** field (or "Name" field). Click in it and type exactly:
   ```
   GMAIL_USER
   ```
   (All capitals, with an underscore. No spaces.)

2. Find the **Value** field. Click in it and type your Gmail address:
   ```
   deem0u.github.io@gmail.com
   ```
   (Use your actual Gmail if it is different.)

3. Look for **Environment** or checkboxes (Production, Preview, Development). Select **all three** if possible (check all boxes). This makes the variable available everywhere.

4. Click **Save** or **Add** (whatever button confirms adding this variable).

### 1.5 — Add the Second Variable (GMAIL_APP_PASSWORD)

1. Click **Add** (or "Add New") to add another variable.

2. In the **Key** field, type:
   ```
   GMAIL_APP_PASSWORD
   ```

3. In the **Value** field, paste your **Gmail App Password**.
   - This is the 16-character password you created in Google (when you set up 2-Step Verification and App Passwords).
   - If it has spaces (e.g. `abcd efgh ijkl mnop`), **remove the spaces** when pasting. It should look like: `abcdefghijklmnop`.

4. Select all three environments (Production, Preview, Development).

5. Click **Save** or **Add**.

### 1.6 — Add the Third Variable (RELAY_SECRET)

1. Click **Add** again.

2. In the **Key** field, type:
   ```
   RELAY_SECRET
   ```

3. In the **Value** field, paste the **random secret** you generated earlier.
   - This is the long string (about 64 characters) you created with `node -e "..."` or `openssl rand -hex 32`.
   - If you don't have it anymore, generate a new one (see EMAIL-SETUP.md Step 2.2) and use it for both Vercel and Cloudflare.

4. Select all three environments.

5. Click **Save** or **Add**.

### 1.7 — Redeploy So the Variables Take Effect

1. Click the **Deployments** tab at the top of the project page.
2. You will see a list of deployments (each one is a build/deploy of your project). The latest one is usually at the top.
3. On the right side of the latest deployment row, look for three dots (⋯) or a **More** button.
4. Click it. A menu will appear.
5. Click **Redeploy**.
6. A popup may ask you to confirm. Click **Redeploy** again.
7. Wait for the deployment to finish. You will see a status (Building, then Ready). This may take a minute or two.

---

## Step 2 — Find and Save Your Relay URL

The relay URL is the web address your Cloudflare Worker will call to send emails. You need to copy it exactly.

### 2.1 — Where to Find It

**Option A — From the project overview**

1. Click the **Overview** tab at the top.
2. Look for a section that shows **Domains** or a URL like `digital-contact-page-relay.vercel.app`.
3. The base URL might be shown there. Your relay endpoint is that URL plus `/api/send`.

**Option B — From a deployment**

1. Click the **Deployments** tab.
2. Click on the **latest deployment** (the top one, which should say "Ready").
3. The deployment page often shows a **Visit** link or the domain. The domain might look like:
   - `digital-contact-page-relay.vercel.app`
   - or `digital-contact-page-relay-xxxxx.vercel.app` (if Vercel added extra characters)

4. Your full relay URL is:
   ```
   https://[that-domain]/api/send
   ```
   For example:
   - `https://digital-contact-page-relay.vercel.app/api/send`

### 2.2 — Write It Down

1. Copy the full URL (including `https://` and `/api/send`).
2. Paste it into a text file or notes app and save it. You will need it for Step 3.
3. Do **not** add a slash at the end. It should end with `send`, not `send/`.

---

## Step 3 — Add Secrets to the Cloudflare Worker

The Cloudflare Worker needs two pieces of information: the relay URL and the relay secret. You add these as "secrets" (they are stored securely and not shown in your code).

### 3.1 — Open Cloudflare Dashboard

1. Open a new browser tab and go to: **https://dash.cloudflare.com**
2. Sign in to your Cloudflare account if needed.
3. You will see the main Cloudflare dashboard.

### 3.2 — Go to Workers

1. On the left-hand side, look for **Workers & Pages** (it may be under a "Workers" section).
2. Click **Workers & Pages**.
3. You will see a list of your workers (serverless functions).

### 3.3 — Open Your Worker

1. Find the worker named **contact-page-editor** (or whatever name you gave it when you set up the Contact Page Editor).
2. Click on the worker name to open it.
3. You will see the worker's overview page.

### 3.4 — Go to Settings and Variables

1. Click the **Settings** tab.
2. Look for a section called **Variables and Secrets** or **Variables**.
3. Click on it (or click **Variables and Secrets** in the left menu if it appears there).
4. You will see a list of variables. You may already have `GITHUB_TOKEN` there. You are going to add two more.

### 3.5 — Add EMAIL_RELAY_URL

1. Click **Add** (or **Add variable**, **Edit variables**, or similar).
2. You may be asked to choose between "Variable" and "Secret". Choose **Secret** (or the option that hides the value).
3. In the **Variable name** or **Key** field, type exactly:
   ```
   EMAIL_RELAY_URL
   ```
4. In the **Value** field, paste the relay URL you saved in Step 2. For example:
   ```
   https://digital-contact-page-relay.vercel.app/api/send
   ```
5. If there is an **Encrypt** or **Save** button, click it.
6. Confirm the variable is saved. It should appear in the list (the value may be hidden with dots or asterisks).

### 3.6 — Add EMAIL_RELAY_SECRET

1. Click **Add** again to add another secret.
2. In the **Variable name** field, type:
   ```
   EMAIL_RELAY_SECRET
   ```
3. In the **Value** field, paste the **exact same** value you used for `RELAY_SECRET` in Vercel (Step 1.6).
   - It must match exactly. If they are different, the Worker will not be able to authenticate with the relay.
4. Click **Encrypt** or **Save**.
5. Confirm it is saved.

### 3.7 — Deploy the Worker (If Needed)

If you have made changes to the Worker code (or if Cloudflare prompts you), you may need to deploy:

1. If you use **Wrangler** (command line): open a terminal, go to your `cloudflare-worker` folder, and run:
   ```
   npx wrangler deploy
   ```
2. If you edit the Worker in the Cloudflare dashboard: after saving your code, click **Save and Deploy** (or similar).
3. If you haven't changed any code and only added secrets, Cloudflare often deploys automatically when you save secrets. Check that the Worker shows as deployed/active.

---

## Summary Checklist

| Step | What you did | Done |
|------|--------------|------|
| 1 | Added GMAIL_USER, GMAIL_APP_PASSWORD, RELAY_SECRET in Vercel | ☐ |
| 1 | Redeployed the Vercel project | ☐ |
| 2 | Found and saved your relay URL (e.g. https://digital-contact-page-relay.vercel.app/api/send) | ☐ |
| 3 | Added EMAIL_RELAY_URL and EMAIL_RELAY_SECRET in Cloudflare Worker | ☐ |

---

## If Something Goes Wrong

- **Vercel:** Make sure you are on vercel.com and signed in. The project name is `digital-contact-page-relay`.
- **Cloudflare:** Make sure you are on dash.cloudflare.com and signed in. Look for Workers & Pages.
- **Secret mismatch:** RELAY_SECRET (Vercel) and EMAIL_RELAY_SECRET (Cloudflare) must be identical. Copy-paste to avoid typos.
- **URL format:** The relay URL must start with `https://` and end with `/api/send`. No trailing slash.

For more help, see **EMAIL-SETUP.md** or the Troubleshooting section in **SETUP-GUIDE.md**.
