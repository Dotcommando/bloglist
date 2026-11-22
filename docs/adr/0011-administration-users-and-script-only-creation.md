# ADR 0011: Administration users and script-only creation

Date: 2026-10-25

Status: Accepted by the owner; implementation contracts agreed in the follow-up discussion.

The console-only creation and local-only entry restrictions are superseded by
[ADR 0059](0059-administrator-settings-and-shared-tables.md). Other account
invariants remain in force.

## Decision

Introduce a dedicated administration-user entity. Its application operations are
UpdateAdminUser, BlockAdminUser, DeleteAdminUser, GetAdminUser and ListAdminUsers.
Creation is available only through an interactive .sh script. The script asks
for the administrator's email and reads their password once, without echoing it.
It invokes a local application boundary; it must not write database records
directly or bypass domain validation and credential handling.

Do not expose creation through an administrative REST endpoint or the admin UI.
Passwords must not enter command-line arguments, logs, documentation or Git.

The media/scheduling batch continues to use explicit local-operator authority.
That temporary authority is not a future network authentication mechanism.
Administration users are global to this installation and currently have access
to all sites. Store allowedSiteIds as an empty array for a future site-assignment
capability; reject non-empty assignments explicitly for now. Update permits
email, password and this reserved empty list. Email is normalized and unique
without case among non-deleted accounts. Block accepts blocked true or false.

Delete marks the account deleted and hides it from normal reads/lists; preserve
the stable identifier for history and release the email for a new identity.
Never block/delete the last active (non-blocked, non-deleted) administrator.
Serialize mutations through a technology-neutral application Unit of Work so
this rule remains true under concurrent updates. MongoDB transactions and their
technical serialization document stay inside the persistence adapter.

Mutations use explicit expected versions. Missing/deleted records fail NotFound;
stale versions fail StaleWrite, duplicate email fails Conflict, invalid input
fails Validation, and removing the last active administrator fails LastAdministrator.
Read returns a safe profile or null. List includes active/blocked accounts by
default, excludes deleted accounts and uses stable keyset pagination.

Passwords use a salted, versioned scrypt digest through an outbound hashing port.
No plaintext or digest appears in profile results. Minimum length is 15 Unicode
code points; maximum is 1024, with no trimming/truncation or composition rules.
The script passes credentials through a bounded stdin pipe, never argv/env/files.
Creation has a console-only composition token absent from normal AppModule.
Login, network authentication and session management are subsequent operations.

The agreed batch contains the five management operations plus the script-only
creation boundary. No real administrator is created automatically at bootstrap.
