# ADR 0013: Session catalog and cancellation

Date: 2026-10-25

Status: Accepted through the owner's implementation discussion.

Implement CreateSession, GetAdminSession, ListAdminSessions,
ListBookableSessions and CancelSession, including REST in the existing HTTP
application. Meetings reference ordinary owned pages. Administrators access all
sites; network entry uses the existing administrator authentication, never local
operator authority. Console/local composition retains its explicitly trusted actor.

One-off meetings may be created in the past. Independent meetings may overlap.
Administrators can cancel a future, started or historical meeting. Cancellation
affects one stable sessionId, retains requests and occupancy, and records a
series exception so generation or schedule editing cannot revive it. Cancellation
uses expectedVersion; an already cancelled matching version is a no-op.

Public queries require a page exposed by a document/request route in one captured
active site release. Defaults are future and Scheduled, including full meetings.
Filters may select future/past/all, Scheduled/Cancelled/all and all/available/full
occupancy. Public results include status and bookable; a meeting is bookable only
while Scheduled, strictly before startsAt, with free places. Explicit history or
cancellation filters do not grant booking access or expose drafts/contacts.

Administrative reads include every lifecycle/time/occupancy state in the selected
period. Both lists use interval intersection, ascending (startsAt, sessionId),
default 20 and maximum 100, and scoped keyset cursors. No artificial query-period
ceiling is introduced. Pages are current committed views; visibility and bookable
are evaluated at the actual request instant, without a long-lived snapshot.

Split session storage/read responsibilities from the unimplemented participation
request/decision store. The session port returns scoped domain snapshots so the
application can verify ownership and output projections. It offers complete
create/find/list/cancel behavior, without booking stubs. Reuse the existing
sessions collection/model and recurrence contracts, add explicit query indexes
through a new migration, and keep SDK types inside adapters.

REST exposes authenticated create/detail/list/cancel operations under
/api/admin/sites/:siteId/sessions and public GET /api/sessions. The public site
comes only from registered hostname resolution; admin site selection is authorized
by the current global administrator entitlement. Actor identifiers never come
from JSON/query input. The session API is explicitly enabled in HTTP settings;
static publication and document delivery remain independent.
