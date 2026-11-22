# Administrator authentication

Implements LoginAdminUser, LogoutAdminUser, GetCurrentAdminUser,
ListAdminAuthSessions and RevokeAdminAuthSession under ADR 0012. Accounts and
sessions are global within the backend installation. Effective installation and
site assignments come from [administrative authorization](admin-authorization.md).
The legacy account field `allowedSiteIds` remains empty. Initial trusted console
creation and authenticated Settings / Access / Users management follow the current
[administration-users contract](administration-users.md#creating-an-administrator).

## Composition and contracts

All five inbound tokens are registered in AppModule.forLocalOperator. The
existing HTTP application independently binds the same operations, real password
verification and persistence, without local-operator access providers. It enables
the authentication routes only with ZARYA_ADMIN_AUTH_ORIGIN. This must be the exact
origin, with no trailing slash, credentials, path, query or fragment; use HTTPS
except for explicit localhost/127.0.0.1/[::1] HTTP origins. Forwarded headers do
not determine identity, origin or client address.

CMS 0.10.0 seeds the initial origin into the global installation_settings
singleton and thereafter reads its committed value for each administrative
request. Settings / General changes the installation address through
GET/POST /api/admin/installation/settings; see
[ADR 0058](../adr/0058-installation-admin-address.md). One captured origin applies
to the entire request. Cookie values include the settings version, checked and
removed at the HTTP boundary before passing the opaque token to authentication.

Address verification distinguishes unavailable local key/settings storage from a
candidate DNS/TLS/status/proof rejection. Local dependency failures retain the
technical route; the ten-second total budget includes the key read. A timed-out
or failed local read cannot begin a later remote probe or commit settings.
Changing the address invalidates existing browser cookies, including when the
hostname stays the same. Existing unversioned cookies require sign-in after this
upgrade. The session database continues to store only opaque-token digests.

| Operation | Input | Success |
| --- | --- | --- |
| LoginAdminUser | email, password; trusted adapter supplies clientAddress/userAgent | 200: user profile and current session; private token delivered only in cookie |
| LogoutAdminUser | Current cookie, which may be absent/invalid | 204, idempotent; clears cookie and revokes only that session |
| GetCurrentAdminUser | Current cookie | 200: user and current session |
| ListAdminAuthSessions | Current cookie, optional limit/cursor | 200: items and nextCursor |
| RevokeAdminAuthSession | Current cookie and own sessionId | 204; clears cookie if revoking current session |

REST paths and example bodies are in README.md. Every POST requires an exact
Origin, X-Zarya-Admin: 1 and application/json (optional charset=utf-8). Logout
and revoke accept an empty JSON object. Login accepts exactly email/password,
both strings; caller-supplied actorId/siteId/device metadata are rejected.
Host must match the configured origin. If present, Sec-Fetch-Site must be
same-origin or none. Read requests also reject a foreign Origin. The server
provides no CORS grant. Unknown routes return 404 and unsupported methods 405.

All responses use Cache-Control: no-store. Bad input returns 400, an oversized
body 413, unsupported content type/encoding 415, and rejected origin/host 403.
An invalid password, unknown email, blocked or deleted account returns the same
401 InvalidCredentials. Current/list/revoke require a valid active session;
otherwise they return 401 AuthenticationRequired and clear the stale cookie.
A foreign or unknown target session returns 404 NotFound. A pause returns
429 TooManyAttempts with Retry-After in seconds. Unexpected failures return
500 InternalError with no internal exception or credential data.

Protected /api/admin requests now authenticate in a shared dispatcher gate before
controllers consume body bytes. Login and idempotent logout remain small-body
exceptions. Owning operations continue to authorize independently.

## Session lifecycle

Login issues a fresh 256-bit opaque token. Only SHA-256 digests are stored in
admin_auth_sessions; token and password never appear in JSON or logs. Existing
cookies are never reused for a new login. Password verification uses the existing
scrypt format with fixed bounded parameters and timingSafeEqual. Missing,
blocked and corrupt-digest accounts incur equivalent derivation work and fail
closed; digest data cannot supply unbounded cost parameters.

The host-only cookie zarya_admin_session uses Path=/api/admin, HttpOnly,
SameSite=Strict and Secure on HTTPS. Both Expires and Max-Age persist login
across browser restarts. There is no client-side token storage requirement.
Expiry is two calendar months after login in UTC, constraining the day at a
shorter month end: December 31 becomes February 28/29. No activity or idle
timer changes that expiry. Browser cookie policy can remove a cookie earlier.

Session profiles contain sessionId, createdAt, lastSeenAt, expiresAt,
clientAddress, userAgent and current. They expose neither token digest nor the
captured account version. The client address comes from the socket; User-Agent
is untrusted descriptive text and must be rendered as text by a future UI.
Current/list/revoke update lastSeenAt in the same transaction as authorization.

Sessions capture the existing opaque admin account version. Every request checks
the account is active and this version still matches. Email/password changes,
block/unblock and soft deletion therefore invalidate all devices atomically
with the account mutation; old rows can remain until expiry cleanup. Unblocking
or recreating a deleted email cannot resurrect old sessions. Actual no-op edits
do not change the version. Password submission always creates a fresh digest
and invalidates prior sessions, even if its plaintext happens to match.

Lists include only one's own unrevoked, unexpired sessions for the current
account version. Ordering is ascending (createdAt, sessionId), limit 20 by
default and at most 100. Cursors bind to account ID and version and contain no
session token. Pages are committed views rather than one long snapshot: newly
created records after the cursor can appear and revoked records disappear.
Revoking another account's session is indistinguishable from a missing ID.
Revoking an already revoked own device is idempotent while the caller remains
authenticated. Revoking the caller itself ends that authentication.

## Attempts and atomicity

admin_login_attempts stores separately namespaced hashes of normalized emails
and trusted socket sources, each with a failure window. Both are checked before
password work; rotating email addresses cannot reset a source's failure budget.
The same socket source may represent several clients behind a proxy. No arbitrary
forwarded header changes this identity. HTTP permits at most two concurrent login
operations per process and rejects excess work with 429/Retry-After: 1.
The first failure opens a fixed fifteen-minute window. The tenth failure within
it starts a fifteen-minute pause measured from that failure. Login during the
pause is rejected even with the correct password and does not extend the pause.
A successful login clears the email and trusted-source counters. An expired window/pause resets logically
without waiting for database cleanup. The limit is shared across processes and
devices, including case/whitespace variants and unknown/blocked accounts; it
does not change the administrator's blocked flag.

The Mongoose transaction adapter composes account-owned records and auth-owned
session/attempt records behind IAdminAuthUnitOfWorkPort. All account/auth writes
share the administration directory serialization record and use snapshot reads
and majority commits. Password derivation runs outside retryable transactions.
Login captures credentials, verifies them and then rechecks account identity,
email/version and the failure window before committing a new session. A
concurrent credential/lifecycle change cannot create valid stale access. Failure
counters commit before their error is reported; session creation and counter
clearing commit together. Logout/revoke and credential changes serialize with
authorization. Adapter/transaction failures propagate without a fallback store.

The schema baseline includes strict validators, unique token digest indexing, owner/keyset
indexing and expiresAt TTL indexes for both new collections. Migration verification
also verifies TTL settings. Expiration/revocation decisions always use explicit
UTC checks; delayed TTL cleanup grants no access. Revoked sessions become
eligible for cleanup at their original expiry. No login secret is migrated or backfilled.

Permanent fake-port application tests cover all five operations and invalidation
states. Adapter tests cover HTTP translation/origin/cookie protections, password
verification, month-end expiry, query scoping and failure propagation. Integration
tests use real HTTP composition and disposable MongoDB databases, including
concurrent failures/revocations, lifecycle changes, rollback and schema checks.
