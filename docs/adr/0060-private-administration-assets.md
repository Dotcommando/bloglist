# ADR 0060: Public sign-in and session-protected administration assets

Date: 2026-11-06

Status: Accepted through the owner's explicit request to split the administration
bundle and protect its internal code before sign-in.

## Decision

Keep CMS 0.10.0 and its existing authentication and API permissions. The public
Svelte entry owns sign-in, session checks and recovery. Load the administration
workspace through a dynamic import only after successful authentication.
Workspace styles and table styles belong to that dynamic dependency graph.

Vite emits its build manifest. At HTTP bootstrap, validate that manifest and
capture the sole entry's static JavaScript/CSS dependency closure as the public
asset allowlist. Dynamic imports and their transitive dependencies require a
valid administrator session, including direct GET and HEAD requests. Missing or
invalid metadata prevents startup; it never falls back to public static serving.
Keep the manifest, source maps and arbitrary files outside document routes.
All administration responses retain no-store caching and the trusted host/CSP
boundary. The Cloudflare gateway continues proxying /admin to this boundary.

Keep the existing host-only HttpOnly session cookie at /api/admin. Issue a second
host-only HttpOnly cookie, zarya_admin_ui_session, at /admin containing the same
versioned opaque token. Both retain SameSite=Strict, HTTPS Secure, and the session's
original fixed expiry. No token is exposed to JavaScript and no database migration
or new authentication privilege is introduced. Successful current-session reads
issue the UI cookie for existing sessions after an installation update. Login
issues both cookies; logout and rejected sessions clear both. Revocation,
account-version changes and expiry are checked server-side on private asset reads.

A failed private-module download shows the existing connection error view.
Retry reloads the public entry and checks the existing session instead of replaying
login. Public HTML contains no preload of private dependencies.

This limits anonymous code disclosure and reduces initial downloads. API routes
remain independently authorized even when their addresses are known. Already
downloaded code cannot be recalled from an authenticated browser.

## Verification

Tests cover static versus dynamic dependency traversal, invalid build metadata,
anonymous and authenticated GET/HEAD, scoped cookies and old-session upgrade,
logout and stale-token rejection, absence of internal API clients in the public
bundle, no private requests before sign-in, and recovery after a chunk failure.
Use the production build with real HTTP composition and an isolated database.
