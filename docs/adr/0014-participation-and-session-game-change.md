# ADR 0014: Participation and changing a session's game

Date: 2026-10-25

Status: Accepted through the owner's implementation discussion.

Implement RequestParticipation, ListSessionRequests, ConfirmParticipation,
DeclineParticipation and ChangeSessionPage, including REST. Visitors need no
account. Game pages and optional meeting/report pages remain manually created
ordinary pages. Changing a meeting's game changes its reference to an existing
same-site page only, including historical/cancelled meetings. Preserve the stable
meeting identity, time, capacity, requests and their states. Store the effective
page reference on the occurrence without turning a page-only exception into a
time/capacity override.

New public requests require an active-published game page, a Scheduled meeting
strictly before its start, positive integral places and enough capacity for the
entire group. Pending requests hold the entire quantity until a manual decision;
there is no automatic expiry, payment, notification or visitor management.
Contact name/phone/email are required. Validate email syntax and accept phone
digits with an optional leading plus, spaces, parentheses and hyphens, without
country inference. Trim/NFC-normalize contacts and canonicalize email case/domain.

Only Pending requests can be decided. Confirmation moves held to confirmed places;
decline releases held places. Decisions remain allowed after the start/in history.
A cancelled meeting permits decline but rejects a new confirmation. Existing
terminal decisions are immutable; retrying the same operation replays its receipt.

Requests and decisions use scoped idempotency keys and immutable operation
receipts. Canonical semantic input is protected by a configured persistent HMAC
key; receipts contain no contacts or raw input fingerprints. Keep receipts for
the lifetime of their requests, without TTL. Decision receipts also provide the
immutable actor/time/result audit. Compare both meeting/request versions and
commit occupancy, request and receipt atomically. Check the public cutoff again
at the persistence boundary; do not retry uncertain writes with a new identity.

Administrator request lists show the contact person and group size, not a roster
of every group member. Default limit is 20, maximum 100; filters select any state
or Pending/Confirmed/Declined, with scoped (requestedAt, requestId) keyset paging.
The store returns owned request states for application-level scope checks.

Use the existing HTTP server and authenticated global administrator boundary.
Enable booking routes explicitly with a configured HMAC key; static delivery and
the session catalog remain independent. No new services or account workflows.
