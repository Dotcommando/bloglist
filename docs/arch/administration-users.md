# Administration users

This batch implements ADR 0011: UpdateAdminUser, BlockAdminUser, DeleteAdminUser,
GetAdminUser and ListAdminUsers, plus the separately authorized console creation
boundary. Use the capability-owned inbound symbols through AppModule's explicitly
trusted local-operator context. All five calls require the configured actorId.
[ADR 0059](../adr/0059-administrator-settings-and-shared-tables.md) adds
authenticated account management and its REST operations. The account list is
available to SystemAdmin under Settings / Access / Users. Public HTTP has no
local-operator authority; account operations use the current session's actor.

## Ownership and data

Administration accounts are global to one backend installation. Explicit role
assignments determine [installation and site authority](admin-authorization.md).
`allowedSiteIds` is a legacy account field that remains empty.

The entity has stable adminUserId, normalized email, blocked, allowedSiteIds,
opaque version, createdAt, updatedAt and nullable deletedAt. Instants use UTC
BSON dates. Its private state also contains an opaque salted passwordDigest.
Normal reads/list responses are explicit profile projections and never include
that digest, passwords or deleted records. Blocked records remain readable.

Email trims surrounding whitespace, normalizes Unicode to NFC, folds case and
converts international domain names through URL/IDNA parsing. It accepts unquoted
local parts; it does not claim mailbox deliverability. A partial case-insensitive
MongoDB unique index covers only records with deletedAt null. Soft deletion
releases the email; recreation receives a new adminUserId and does not revive the
old identity or its history.

## Operations

| Operation | Input and result |
| --- | --- |
| GetAdminUser | actorId, adminUserId; safe profile or null for missing/deleted identity |
| UpdateAdminUser | actorId, adminUserId, expectedVersion; optional email, password, allowedSiteIds; at least one change; returns safe updated profile |
| BlockAdminUser | actorId, adminUserId, expectedVersion, blocked boolean; returns profile; an already matching state is a no-op after checking the version |
| DeleteAdminUser | actorId, adminUserId, expectedVersion; marks deleted and returns adminUserId, deletedAt, version |
| ListAdminUsers | actorId, optional status All/Active/Blocked, limit and cursor; returns items and nextCursor |

List defaults to All, 20 records, and a null cursor; maximum limit is 100.
Ordering is ascending (createdAt, adminUserId), including a stable unique
tie-breaker. Cursors are opaque and bound to their status filter. Reads are
current committed views, not a snapshot across pages: concurrent removals may
disappear and new records after the cursor may appear. The caller must follow
nextCursor to consume the whole result. No credential data enters a cursor.

Forbidden rejects an untrusted local actor. Invalid inputs, non-empty site
assignments, malformed/filter-mismatched cursors and invalid counts fail
Validation. Mutation of a missing/deleted account fails NotFound; an outdated
expectedVersion fails StaleWrite; duplicate live email fails Conflict.
Blocking one's own account fails Forbidden. Blocking/deleting the last
non-blocked, non-deleted administrator fails
LastAdministrator. Removing an already blocked account is allowed. Repeating
deletion addresses a hidden deleted record and therefore fails NotFound.

The application calls the domain's last-administrator policy using the active
SystemAdmin count inside an IAdminUserUnitOfWorkPort callback. The real MongoDB adapter first
writes one private directory-serialization record in the same transaction. This
prevents write skew when different accounts are blocked/deleted concurrently.
It checks acquisition, compares account versions, and commits all changes or
nothing. Driver transaction retries repeat only database/domain work; password
hashing occurs outside the callback. No SDK/session/query type crosses the port.
The global admin_users and admin_user_locks collections, their validators and
indexes are created only through the schema baseline; automatic schema/index creation
remains disabled. Bootstrap never fabricates an administrator.

## Creating an administrator

Configure the existing local environment, apply migrations and compile:

```sh
docker compose up -d mongo
npm ci
npm run build
npm run migrate
bash scripts/create-admin.sh
```

In the built Docker image, the same script is /app/scripts/create-admin.sh and
can be invoked with an interactive docker compose exec app bash invocation.
On Windows, run it in Git Bash. The script requires a terminal and creates a
SystemAdmin by default. Pass the identifier of an existing site to create a
SiteAdmin for that site.

```sh
bash scripts/create-admin.sh --site-id SITE_ID
```

The script asks for email, then reads the password once without echo. It
disables shell tracing and passes both credential lines through stdin to the
private compiled console entry. The site identifier is the only optional
argument. Success prints only the new account identifier. The private entry
bounds stdin to 8192 bytes and sanitizes unexpected errors.

The private console token is bound only in AppModule.forAdminUserCreation, which uses the same
backend's persistence/admin providers without rendering or scheduling providers.
Normal AppModule.forLocalOperator and public HTTP cannot resolve its creation
token. ADR 0059 also exposes authenticated creation through POST /api/admin/users
using the same CreateAdminUser implementation. The private console names remain
compatibility exports; the console token stays separate from normal local
composition. The account and its assignment are saved in the same transaction.
The first SystemAdmin completes installation setup. A SiteAdmin assignment
applies to the site's built-in Site group.
Operators should run migrations explicitly; this script never migrates on its own.

SystemAdmin can also create an account from a site's Settings / Access / Create user tab.
The form submits the chosen built-in or site-owned custom role with the account.
System Admin is installation-wide. The other roles are assigned on the
selected site. The account and assignment commit together, and a custom role
from another site fails validation.

Passwords contain 15 through 1024 Unicode code points; whitespace is preserved,
and NUL/newline are rejected by the two-line console policy. The scrypt adapter
uses N=32768, r=8, p=3, a fresh 16-byte salt, a 64-byte derived key and a 64 MiB
memory ceiling. Its versioned encoded digest records the algorithm and parameters
for the authentication verifier. These parameters are one of the documented
[OWASP scrypt configurations](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt);
the minimum length/code-point convention follows the corresponding
[NIST password guidance](https://pages.nist.gov/800-63-4/sp800-63b.html#passwordver).
Login, temporary attempt limits, network authentication and session revocation
are now implemented in [the authentication capability](admin-authentication.md).
Actual email/password changes invalidate all account sessions. Saving the same
normalized email or the unchanged empty site list preserves the account version
and its sessions after checking expectedVersion. An empty update still fails.

## Verification

Permanent application tests use deterministic fake outbound ports. Adapter tests
cover profile projection, cursor validation, transaction/lock failure, actual
password derivation and private input parsing. Isolated integration tests use
real AppModule, MongoDB transactions, unique indexes/validators and the compiled
console entry. They cover profile updates, stale writes, all concurrent
block/delete combinations, initial serialization races, rollback, soft deletion,
email reuse, list filters/pagination and credential-free outputs. The Bash wrapper
is also checked interactively with synthetic credentials in a disposable database.
These checks neither create a real administrator nor deploy the application.
