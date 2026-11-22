# ADR 0012: Administration authentication and persistent sessions

Date: 2026-10-25

Status: Accepted by the owner in the authentication implementation discussion.

## Decision

Implement LoginAdminUser, LogoutAdminUser, GetCurrentAdminUser,
ListAdminAuthSessions and RevokeAdminAuthSession with REST/JSON endpoints under
/api/admin/auth in the existing HTTP application. Network composition receives
no local-operator authority. Administrator creation remains script-only.

Login uses email/password and an opaque server-side session stored in MongoDB.
The browser receives a persistent host-only HttpOnly cookie. Sessions expire
two calendar months after login, calculated in UTC with end-of-month constraint.
There is no inactivity timeout or sliding expiry. Multiple devices are allowed.
Logout terminates only the presented session. List/revoke concern only the
authenticated administrator's own sessions; only active sessions are listed.

Changing email/password, blocking, unblocking or deleting an account changes its
existing opaque account version. Sessions capture that version and are invalid
when it differs, even after unblocking. No-op account edits retain the version.
Login checks the captured account version again before committing a session,
preventing a concurrent credential/lifecycle change from issuing stale access.

Ten failed attempts for a normalized email within fifteen minutes pause login
for fifteen minutes from the tenth failure. Success resets the failure window.
This is a temporary login restriction, not an account blocked state. Unknown,
blocked and deleted accounts have the same invalid-credentials response and
perform the same password-verification cost. No per-device session ceiling or
additional idle/reauthentication policy is introduced.

Use the existing administration Unit of Work's serialization boundary for
atomic login, failure-count, logout/revoke and account-version decisions. Store
only token digests, never raw bearer tokens. A validated configured admin origin
owns the HTTP boundary; require exact Host and same-origin mutation headers,
application/json and an explicit custom request header. Secure cookies are
mandatory for HTTPS; HTTP is supported only for explicitly configured localhost
origins. Ignore forwarded headers rather than trusting arbitrary proxy metadata.

Extend AppModule's local composition with the five inbound operations. The HTTP
composition binds only authentication operations when its admin origin is
explicitly configured, preserving independent public document delivery. The
Svelte frontend and other administrative REST operations remain separate work.
