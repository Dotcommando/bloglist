# Participation and changing a meeting's game

> Historical implementation scope. This document records an early development
> boundary, including optional business capabilities. For current operation use
> the [developer guide](../guide/en/README.md) and maintained capability contracts.
> It does not authorize installing business code in the clean CMS distribution.

Historical integration contract: scheduling and booking implementation now belongs to the separate site installation. It is not installed in the clean CMS. See [ADR 0037](../adr/0037-clean-cms-and-site-installations.md).

[ADR 0036](../adr/0036-site-addons.md) now delivers this capability through the
separate installed participation package and a site-owned add-on connection.
See [the implemented add-on contracts](site-addons-contracts.md). Public/new
operations require Enabled; retained administrative workflows remain available
while Disabled. This access check also precedes public operation-receipt replay.

The five implemented operations follow [ADR 0014](../adr/0014-participation-and-session-game-change.md).
Inbound interfaces live under `src/ports/inbound/participation/`; local AppModule
and the existing HTTP server bind real adapters. Booking composition is optional
and requires an explicitly configured persistent HMAC key. Global authenticated
administrators currently have access to all sites.

`ChangeSessionPage(siteId, actorId, sessionId, pageId, expectedVersion)` requires
an existing same-site ordinary Page. It changes only pageId/version and returns
the administrative session projection. Same-page input is a checked no-op.
Historical/cancelled sessions are allowed. Series schedule changes retain the
effective page reference; a page-only change does not freeze time/capacity edits.
No Page is created, no separate Game exists and requests remain attached to the
same sessionId. NotFound, Forbidden, Scope and StaleWrite are explicit failures.

`RequestParticipation(siteId, sessionId, places, contact, idempotencyKey)` accepts
an anonymous whole-group request. Site identity comes from trusted hostname
resolution at REST. Require a Scheduled future session, active-published page
and enough capacity. Name (up to 200 characters), phone (64), email (254) are
required; trim contacts and NFC-normalize name/email. Accept phone digits with
optional leading plus, spaces, parentheses and hyphens. Email case/domain is
canonicalized. Quantity is a positive safe integer with no extra group ceiling.
All places are held or none; holds have no expiry. Public output is only the
original Pending receipt: reference, sessionId, places, state and acceptedAt.

`ListSessionRequests` authorizes before reading contacts, verifies the owned
session and each returned request, and returns explicit private projections with
requestId/reference, sessionId, places, contact, state, requestedAt and version.
Default limit 20, maximum 100; optional state selects Pending/Confirmed/Declined.
Keyset order is (requestedAt, requestId); cursors bind site, session and filter.
There is no roster of all group members. Missing session fails NotFound rather
than appearing as an empty list.

`ConfirmParticipation` and `DeclineParticipation` take siteId, actorId,
requestId, expectedRequestVersion and idempotencyKey. Only Pending requests can
transition. Confirmation moves the full quantity from held to confirmed; decline
releases the held quantity. Historical decisions are allowed. Cancelled sessions
forbid new confirmation and permit decline. Existing terminal decisions require
same-command replay; a fresh terminal transition fails InvalidTransition.
Output includes requestId, sessionId, quantity, next requestVersion, decidedAt
and the typed terminal state. Administrator identity comes from authentication.

## Atomic persistence and repeated commands

`ISessionStorePort` owns session catalog operations; `IParticipationStorePort`
owns private requests and operation receipts. Mongoose commits request creation,
occupancy and immutable receipt in one transaction. Decisions compare both
request/session versions and commit counters, state, actor/time and receipt
together. A stale independent update fails StaleWrite; no automatic write retries
are performed. A second scoped request read detects a decision committed between
the independent initial reads. Persistence rechecks snapshots/domain transitions
and the booking cutoff using database UTC time before updating counters.

Keys are 1..128 ASCII letters/digits or `._:-`. Receipt uniqueness is scoped to
(site, operation, actor, key digest); public requests use a null actor. Semantic
identity is HMAC-SHA256 of canonical command values, including normalized contact
for creation and expectedRequestVersion for decisions. Receipt records contain
neither contacts nor raw keys. A matching receipt replays the original result
before mutable eligibility/version checks. Different semantic input fails
IdempotencyConflict. Unknown write outcomes trigger one majority receipt lookup:
return a matching committed result, otherwise propagate the failure. Callers
retry the same key; there is no new operation identity on uncertain completion.

Migration 0011 adds explicit validators and unique request-reference/operation
indexes. Receipts retain actor/time/result audit for the lifetime of requests;
there is no TTL or request-deletion workflow. Contacts and receipts remain
private database data and never enter published artifacts. Core/static delivery
does not require booking configuration. Missing configuration disables booking;
nonempty keys shorter than 32 UTF-8 bytes fail bootstrap.

These historical routes are business add-on responsibilities; see the current
[extension boundary](site-addons-contracts.md).
Malformed inputs return 400, authentication failures 401, denied access 403,
missing objects 404, optimistic/business conflicts 409 and unknown dependency
failures 500. Bodies are bounded to 8192 UTF-8 bytes; oversized bodies return 413.
No notifications, payments, visitor accounts or automatic page creation are
part of these operations.
