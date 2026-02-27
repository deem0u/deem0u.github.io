# Cleanup and audit (2026-02-11)

## Summary

- **Security:** SECURITY-RISK-AUDIT.md updated; CORS, 500 error, push-message sanitization, rate limiting marked remediated; §11 audit update added.
- **Restore point:** RESTORE-POINTS.md updated with commit `ef38cd3`.
- **Validation:** VALIDATION-AUDIT.md re-validated; audit update (2026-02-11) added; no form/validation changes.
- **Variables:** VARIABLE-AUDIT.md re-audited; audit update (2026-02-11) added; MyAccount QR uses existing form/variable semantics.

## Code cleanup

- **Duplicate `escapeHtml` removed (admin):** Second definition at end of `admin/index.html` removed; single definition retained earlier in file; `showAlert`/`hideAlert` unchanged.
- **Duplicate `escapeHtml` removed (myaccount):** Second definition before `showAlert` in `myaccount/index.html` removed; first definition (earlier in file) is the only one; `showAlert` still uses it.

## CSS and codebase

- **CSS:** Spot-checked usage of `.modal-qr-action-template`, `.step3-back-link`, `.editor-form-disabled` — all referenced in HTML/JS. No unused-CSS sweep was run; doing that safely would require an automated unused-CSS tool (e.g. PurgeCSS with care not to strip dynamic classes).
- **Dead code:** No empty or obviously unused functions found. Comment blocks exist for documentation; no large commented-out code blocks removed.

## Recommended follow-up

- Run an unused-CSS audit with a dedicated tool if bundle size or maintainability is a concern.
- Keep a single `escapeHtml` (and, where needed, `showAlert`/`hideAlert`) per page to avoid redefinition.
