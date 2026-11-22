# Session catalog and cancellation

> Historical implementation scope. This document records an early development
> boundary, including optional business capabilities. For current operation use
> the [developer guide](../guide/en/README.md) and maintained capability contracts.
> It does not authorize installing business code in the clean CMS distribution.

Historical integration contract: scheduling and booking implementation now belongs to the separate site installation. It is not installed in the clean CMS. See [ADR 0037](../adr/0037-clean-cms-and-site-installations.md).

Implements CreateSession, GetAdminSession, ListAdminSessions,
ListBookableSessions and CancelSession under ADR 0013. All five inbound tokens
are registered in AppModule. HTTP uses the same application factories with real
adapters and the existing administrator authentication. There is no Game entity.

## Ownership and entry

Sessions belong to siteId and reference an ordinary pageId in that site.
One-off creation accepts an existing draft page and historical or overlapping
dates. To document a previously held meeting, create its ordinary page/draft and
then the past meeting. A report page is not created implicitly.

Local entry uses the explicitly trusted local operator. Administrative REST
obtains actorId from GetCurrentAdminUser and checks the account is still an
active global administrator. All sites are currently available; allowedSiteIds
remains the reserved empty list. The route selects an authorized site, while
JSON/query actorId or siteId injection is rejected. Public REST accepts no siteId:
the registered hostname is resolved through ResolveSite; unknown/archived hosts
have no public calendar. Forwarded headers are ignored.

ZARYA_SESSION_API_ENABLED explicitly enables the routes documented in README.md.
Administrative routes additionally require ZARYA_ADMIN_AUTH_ORIGIN. A public-only
calendar requires neither local-operator nor administrator providers. HTTP does
not start another application or a background scheduling process. Existing local
composition owns the rolling-horizon lifecycle.

POST bodies are bounded JSON objects, at most 8192 UTF-8 bytes, with the same
exact Origin/Host, custom-header, duplicate-cookie and HttpOnly session rules as
authentication. Timestamps require ISO instants with an offset and are converted
to UTC; date-only/local strings are rejected. timeZone remains explicit IANA data.
Administrative creation returns 201 with the stored session snapshot. Detail,
lists and cancellation return 200. Missing/foreign details and cancellation
targets return 404. Stale expectedVersion is 409. Invalid input/filter/cursor is
400, denied account/origin is 403, missing/invalid authentication is 401, oversized
body is 413 and unsupported body encoding/type is 415. Unexpected dependency
failures return sanitized 500; they never become an empty successful calendar.
All calendar responses use Cache-Control: no-store.

## Views and filtering

Administrative details/lists expose sessionId, pageId, startsAt, endsAt,
timeZone, availablePlaces, status, bookable, capacity, heldPlaces,
confirmedPlaces, version and seriesId. Lists include past/future, full and
cancelled meetings within the selected period, optionally filtered by pageId.
There is no request/contact roster in this batch.

Public lists require an owned page exposed by a static/request document route in
one captured active Ready release; publishing a draft without activating a site
release is insufficient. Redirects alone do not expose a page. Publication read
failures fail closed and public filters never bypass publication eligibility.
Only public fields are projected: sessionId, pageId, UTC start/end, timeZone,
availablePlaces, status and bookable. No account, occupancy breakdown, series,
internal version or contact data is returned.

Public filters are independent closed enums:

- time: Future/Past/All, default Future. Future means startsAt strictly later
  than the request instant; Past includes already started/ongoing meetings.
- status: Scheduled/Cancelled/All, default Scheduled.
- availability: All/Available/Full, default All. Availability measures remaining
  capacity independently of lifecycle/time. Cancelled or historical meetings may
  have remaining places but always have bookable false.

bookable requires Scheduled, startsAt strictly after now and positive remaining
places. At startsAt it is false. This batch implements the eligibility/read rule;
RequestParticipation remains unimplemented and must later enforce the same
cutoff atomically when reserving places. A displayed count never reserves them.

Both lists require a UTC rangeStart/rangeEnd and select intersecting intervals:
startsAt < rangeEnd and endsAt > rangeStart. There is no arbitrary maximum period.
Limit defaults to 20 and may be 1..100. Results sort by (startsAt, sessionId),
with an opaque keyset cursor bound to site, page, range and filter values.
Changing a limit may continue the same cursor; changing scope/filter requires a
new query. Cursors are not authorization or secrets. Pages are committed views,
not one long snapshot: starts, reschedules, cancellations and occupancy updates
can change subsequent pages. Public time filters and bookable use the current
request time. The application checks returned scope, interval/filter membership,
occupancy invariants, ordering and page size before projecting results.

## Cancellation and persistence

CancelSession accepts siteId, trusted actorId, sessionId and expectedVersion.
It permits historical/started meetings and changes only status, the occurrence
exception flag and version. Capacity, dates, page/session identities, occupied
places and all requests remain intact. An already cancelled matching version is
a no-op. The administrator can contact participants and handle requests later.
There is no automatic decline, transfer, notification or release of places.

An explicit cancellation in a series sets overridden true. Existing series edit
and horizon-generation rules preserve that exception and stable sessionId;
cancelled occurrences are not regenerated. A single-document version guard
prevents a stale cancellation from overwriting concurrent schedule/occupancy
changes. Conversely series transactions guard the captured occurrence version,
so a concurrent cancellation cannot disappear in a successful stale series edit.
No blind application retry is performed after an uncertain write; inspect the
current version through GetAdminSession before issuing a new guarded command.

ISessionStorePort completely owns create/find/list/cancel and returns scoped
domain snapshots. IParticipationStorePort now concerns request reads, receipts
and atomic booking decisions only; it has no fake implementation in production.
The Mongoose catalog and schedule adapters share the same explicit sessions
model. The page reference adapter reads a minimal scoped projection within the
page capability; the public eligibility adapter uses publication ports.
Migration 0010 preserves the existing strict session validator and occurrence
uniqueness, adding site/calendar and page/status/calendar indexes. Earlier
migration files/checksums are unchanged; schema mutation at startup remains off.

Permanent fake-port unit tests cover each operation and its failures. Adapter
tests cover scope/filter/cursor translation, guarded cancellation, account/page
access, publication visibility, input parsing and HTTP protections. Isolated
integration tests use real AppModule/HTTP, MongoDB transactions/indexes and
immutable publication files, including historical dates, tied-time pagination,
public visibility, cancellation races and recurrence exception preservation.
