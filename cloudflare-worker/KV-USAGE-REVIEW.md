# Cloudflare Worker KV usage review

This document summarizes KV usage in the worker and optimizations applied or recommended to stay within Cloudflare KV limits (e.g. 100,000 reads/day on free tier).

## Optimizations applied (this review)

1. **Try lowercase key first (`getKvUser`)**  
   User-scoped keys are written in lowercase (signup and admin flows). The worker now uses a helper `getKvUser(env, prefix, uLower, u)` that does one get with the lowercase key and only does a second get with the original casing if the first returns null. This cuts roughly half the reads in:
   - **handleDebugUser** – all single-user keys (account_email, user_first_name, user_last_name, user_password_hash, user_otp, email_verified, email_verified_admin, max_contact_pages, divert_email, account_details_sent, user_dob, user_recovery).
   - **handleGetAccountSetupStatuses** – account_email, user_dob, user_recovery per user.
   - **handleGetAccountProfiles** – user_first_name, user_last_name, account_email per user.
   - **handleGetAccountEmails** – email_verified_admin and email_verified in the emailVerification loop.

2. **Single read for `max_contact_pages` in contact-pages list**  
   In **handleListContactPages**, `max_contact_pages` is now read once at the start (after computing `uLower`) and reused for both the 404 and 200 branches, avoiding any duplicate read.

## KV usage by handler (summary)

- **High read usage (admin)**  
  - **handleGetAccountEmails** – 1 list + N gets (account_email values) + 1 list + M gets (account_email_to_folder) + 1 list (account_details_sent) + 2N gets (email_verified*).  
  - **handleGetAccountProfiles** – 3 lists (first_name, last_name, account_email) to build casing map, then 3 gets per requested user (with getKvUser).  
  - **handleGetAccountSetupStatuses** – 1 list (account_email) + 3 gets per user (with getKvUser).  
  - **handleDebugUser** – multiple listAllKvKeys + many getKvUser calls; heavy but admin-only.  
  - **handleGetSiteSettings** – 3 gets (site:*), 1 list (divert_email:) + get per key, 1 list (max_contact_pages:) + get per key.  
  - **collectKvOrphans / handleGetKvOrphans** – many listAllKvKeys (one per prefix) + gets for account_email_to_folder; run only when admin opens KV tools.

- **Per-user / per-request (moderate)**  
  - **validateAuth** – 1 get (admin:key) or JWT verification (no KV for user auth).  
  - **handleListContactPages** – 1 get (max_contact_pages) + 1 get per contact page (contact_page_name).  
  - **handleGetProfile** – 5 gets per request.  
  - **handleGetSecrets** – several gets per request.

- **Writes**  
  Writes are less frequent than reads; main sources are signup, profile/secret updates, admin create/delete, and KV cleanup.

## Recommendations (no code changes yet)

1. **Admin dashboard**  
   The admin UI loads account-emails, account-profiles, and secrets-status in parallel on dashboard load. That’s one burst per visit. Avoid adding polling or auto-refresh on a short interval; keep manual refresh or long intervals if needed.

2. **Cache-Control**  
   Handlers that return rarely changing data (e.g. site-status, setup status) already or could use short `Cache-Control` (e.g. 60s) where appropriate so browsers/CDNs don’t hit the worker on every tab open. Don’t cache user-specific or sensitive data.

3. **KV orphans / cleanup**  
   `handleGetKvOrphans` and `handleKvCleanup` are expensive (many list + get). Keep them admin-only and run only when needed (e.g. “View orphans” / “Run cleanup”), not on every admin page load.

4. **List pagination**  
   `listAllKvKeys` correctly paginates with cursor. For very large namespaces, consider limiting the number of pages or keys per request if you add “list all” admin features later.

5. **Monitor usage**  
   In the Cloudflare dashboard, use Workers → Metrics and KV → Metrics to track read/write volume and stay within plan limits.

## Reference: KV limits (Cloudflare)

- Free: 100,000 reads/day, 1,000 writes/day per namespace.  
- Paid: higher limits; see Cloudflare docs for current numbers.

Reads are counted per key read (each `get` and each key returned in a `list`). Listing 1,000 keys counts as 1,000 reads.
