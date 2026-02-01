# Email Relay

Serverless function that sends emails via Gmail SMTP using Nodemailer. Called by the Cloudflare Worker for automated transactional emails.

**Deploy to Vercel:** See [../EMAIL-SETUP.md](../EMAIL-SETUP.md) for full setup instructions.

Quick deploy:
```bash
cd email-relay
npm install
vercel
```
Then add environment variables in Vercel Dashboard: `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `RELAY_SECRET`.
