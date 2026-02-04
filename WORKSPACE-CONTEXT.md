# Workspace Context — Digital Luggage Tags

This file summarizes the Cursor workspace layout and what's been modified in the repository.

## Workspace structure

The workspace root **is** the GitHub Pages repo (deem0u.github.io). Flat layout:

```
Proj.DigitalLuggageTags/   (= deem0u.github.io repo root)
├── admin/
│   └── index.html         # Admin dashboard
├── cloudflare-worker/
│   ├── worker.js         # Cloudflare Worker (deploy to Workers)
│   └── wrangler.toml
├── myaccount/
│   ├── index.html        # User portal (sign in, edit contact page, profile)
│   └── edit-secrets.js
├── home/
│   └── index.html
├── signup/
│   └── index.html
├── user/
│   └── <username>/       # Per-user contact pages (e.g. user/danielmounnarath/index.html)
│       └── *.html
├── styles.css            # Shared styles
├── linky-mascot.html     # Linky Mascot Suite — SVG reference (full + mini icons, palette)
├── account-details-content.js
├── form-descriptions.js
├── countries-data.js
├── SETUP-GUIDE.md
├── release/
│   └── digital-luggage-tags-artifacts.zip
└── WORKSPACE-CONTEXT.md  # This file
```

## Repository and deploy targets

- **GitHub Pages**: This workspace = https://github.com/deem0u/deem0u.github.io — Live site: https://deem0u.github.io/
- **Cloudflare Worker**: `cloudflare-worker/worker.js` → Workers dashboard (e.g. `contact-page-editor`).

## Modifications in the repository

1. **Additional Information (optional field)**
   - Added to Admin (New User + Edit Contact) and Self-Service (Edit) forms.
   - Shown on the live contact page after "Destination Details" (English + Chinese).
   - Non-mandatory; uses existing form CSS (e.g. `.form-textarea`, `.form-label-optional`).

2. **Admin Dashboard**
   - Recovery cluster on its own row; Contact Page cluster has a searchable dropdown for contact cards per user.
   - Worker `GET /api/contact-pages/:username` lists contact page names for a user.

3. **SETUP-GUIDE.md**
   - New "Additional Information" feature and editing notes.
   - Updated "Files to Deploy" and daily-usage instructions.

4. **Release artifacts**
   - `release/digital-luggage-tags-artifacts.zip` includes SETUP-GUIDE, worker, wrangler, `styles.css`, `admin/index.html`, `myaccount/index.html`.

## Updating from GitHub

From the workspace root:

```bash
git pull
```

## Cursor rules

Project context is also in `.cursor/rules/digital-luggage-tags.mdc` so the AI keeps workspace layout and recent changes in mind.
