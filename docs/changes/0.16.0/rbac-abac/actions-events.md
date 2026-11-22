# Events actions

The inventory uses Events runtime `0.4.5` from `zarya-addon-events` at revision
`714f4b2`. The catalog has 16 actions. Routes were taken from the manifest
`artifacts/events-0.4.5/addon.runtime.json` and expanded using its packaged
`server/runtime.cjs` handlers. The current source package's
`docs/arch/participation.md` describes the underlying behavior. This inventory
describes the inspected artifact.

The JSON array contains candidate documents for the `actions` collection in CMS
0.16.0. Each object is one HTTP method and route template. MongoDB can generate
`_id`; role grants refer to the stable `actionId`. The booleans describe business
effects and are independent of grants. See [ADR 0091](../../../adr/0091-endpoint-actions-and-site-access.md).

All actions operate on one site. Public routes use the site's trusted request
authority and require an enabled connection. Administrative routes use the
selected site and actor; availability on a disabled connection depends on the
owning operation's retained-access rules. `cms.pages` is a CMS domain because
sessions reference CMS-owned pages.

The public `cms.extensions.events.sessions` queries and the recurrence horizon
job are server invocations outside this HTTP catalog.

```json
[
  {
    "actionId": "events.sessions.list-public",
    "method": "GET",
    "route": "/api/sessions",
    "scope": "site",
    "admission": "public",
    "shortDescription": "List public sessions",
    "description": "Returns a bounded cursor page of public session summaries for a page with an eligible active publication. The request authority resolves the site, and the Events connection must be enabled.",
    "domains": ["events.sessions","cms.pages"],
    "create": false,
    "read": true,
    "update": false,
    "delete": false,
    "execute": false
  },
  {
    "actionId": "events.participation-requests.create-public",
    "method": "POST",
    "route": "/api/participation-requests",
    "scope": "site",
    "admission": "public",
    "shortDescription": "Request participation",
    "description": "Accepts a public whole-group request for an eligible scheduled session. Creates a pending request and holds all requested places atomically. A matching idempotent replay returns the original receipt.",
    "domains": ["events.participation-requests","events.sessions","cms.pages"],
    "create": true,
    "read": false,
    "update": true,
    "delete": false,
    "execute": false
  },
  {
    "actionId": "events.sessions.list",
    "method": "GET",
    "route": "/api/admin/sites/:siteId/sessions",
    "scope": "site",
    "admission": "admin",
    "shortDescription": "List sessions",
    "description": "Returns an authorized cursor page of sessions for the site's administration, including the pending request count for each returned session. The query can select a page and time range.",
    "domains": ["events.sessions"],
    "create": false,
    "read": true,
    "update": false,
    "delete": false,
    "execute": false
  },
  {
    "actionId": "events.sessions.create",
    "method": "POST",
    "route": "/api/admin/sites/:siteId/sessions",
    "scope": "site",
    "admission": "admin",
    "shortDescription": "Create a session",
    "description": "Creates a one-off session for an existing page on the site using the supplied time interval, time zone and capacity. Requires an enabled Events connection.",
    "domains": ["events.sessions","cms.pages"],
    "create": true,
    "read": false,
    "update": false,
    "delete": false,
    "execute": false
  },
  {
    "actionId": "events.sessions.read",
    "method": "GET",
    "route": "/api/admin/sites/:siteId/sessions/:sessionId",
    "scope": "site",
    "admission": "admin",
    "shortDescription": "Read a session",
    "description": "Returns the site's administrative session projection, including scheduling state, occupancy and the version needed for guarded edits.",
    "domains": ["events.sessions"],
    "create": false,
    "read": true,
    "update": false,
    "delete": false,
    "execute": false
  },
  {
    "actionId": "events.sessions.cancel",
    "method": "POST",
    "route": "/api/admin/sites/:siteId/sessions/:sessionId/cancel",
    "scope": "site",
    "admission": "admin",
    "shortDescription": "Cancel a session",
    "description": "Changes the identified session to cancelled using its expected version. Retains the session record and its requests.",
    "domains": ["events.sessions"],
    "create": false,
    "read": false,
    "update": true,
    "delete": false,
    "execute": false
  },
  {
    "actionId": "events.sessions.change-page",
    "method": "POST",
    "route": "/api/admin/sites/:siteId/sessions/:sessionId/page",
    "scope": "site",
    "admission": "admin",
    "shortDescription": "Change a session page",
    "description": "Changes the page associated with the session to an existing page on the same site. Requests retain their existing session identity.",
    "domains": ["events.sessions","cms.pages"],
    "create": false,
    "read": false,
    "update": true,
    "delete": false,
    "execute": false
  },
  {
    "actionId": "events.sessions.remove",
    "method": "POST",
    "route": "/api/admin/sites/:siteId/sessions/:sessionId/remove",
    "scope": "site",
    "admission": "admin",
    "shortDescription": "Remove a session",
    "description": "Deletes an empty session or cancels it when requests exist and retains those requests. Removing an empty recurring occurrence records an exclusion to prevent regeneration.",
    "domains": ["events.sessions","events.session-series"],
    "create": true,
    "read": false,
    "update": true,
    "delete": true,
    "execute": false
  },
  {
    "actionId": "events.sessions.reschedule",
    "method": "POST",
    "route": "/api/admin/sites/:siteId/sessions/:sessionId/reschedule",
    "scope": "site",
    "admission": "admin",
    "shortDescription": "Reschedule a session",
    "description": "Changes the future session's start, end, time zone and capacity under a version check. A series occurrence retains an individual exception, and current occupancy constrains capacity.",
    "domains": ["events.sessions","events.session-series"],
    "create": false,
    "read": false,
    "update": true,
    "delete": false,
    "execute": false
  },
  {
    "actionId": "events.session-series.list",
    "method": "GET",
    "route": "/api/admin/sites/:siteId/session-series",
    "scope": "site",
    "admission": "admin",
    "shortDescription": "List event series",
    "description": "Returns all authorized series on the site in identity order, including ended or retained series.",
    "domains": ["events.session-series"],
    "create": false,
    "read": true,
    "update": false,
    "delete": false,
    "execute": false
  },
  {
    "actionId": "events.session-series.create",
    "method": "POST",
    "route": "/api/admin/sites/:siteId/session-series",
    "scope": "site",
    "admission": "admin",
    "shortDescription": "Create an event series",
    "description": "Creates a recurring series for an existing site page and atomically materializes its bounded schedule of session occurrences. Requires an enabled Events connection.",
    "domains": ["events.session-series","events.sessions","cms.pages"],
    "create": true,
    "read": false,
    "update": false,
    "delete": false,
    "execute": false
  },
  {
    "actionId": "events.session-series.read",
    "method": "GET",
    "route": "/api/admin/sites/:siteId/session-series/:seriesId",
    "scope": "site",
    "admission": "admin",
    "shortDescription": "Read an event series",
    "description": "Returns the identified event series on the site, including its recurrence pattern and current version.",
    "domains": ["events.session-series"],
    "create": false,
    "read": true,
    "update": false,
    "delete": false,
    "execute": false
  },
  {
    "actionId": "events.session-series.change-schedule",
    "method": "POST",
    "route": "/api/admin/sites/:siteId/session-series/:seriesId/schedule",
    "scope": "site",
    "admission": "admin",
    "shortDescription": "Change a series schedule",
    "description": "Changes one occurrence, following occurrences, or the series according to the command scope. Updates or cancels affected future sessions, creates additional occurrences when needed, and preserves past sessions and occupancy.",
    "domains": ["events.session-series","events.sessions"],
    "create": true,
    "read": false,
    "update": true,
    "delete": false,
    "execute": false
  },
  {
    "actionId": "events.participation-requests.count-pending",
    "method": "GET",
    "route": "/api/admin/sites/:siteId/events/menu-badge",
    "scope": "site",
    "admission": "admin",
    "shortDescription": "Count pending participation requests",
    "description": "Counts pending participation requests for the selected site without returning request details.",
    "domains": ["events.participation-requests"],
    "create": false,
    "read": true,
    "update": false,
    "delete": false,
    "execute": false
  },
  {
    "actionId": "events.participation-requests.list",
    "method": "GET",
    "route": "/api/admin/sites/:siteId/sessions/:sessionId/requests",
    "scope": "site",
    "admission": "admin",
    "shortDescription": "List participation requests",
    "description": "Returns a bounded private cursor page of requests for the site session, including contact details, group quantity, decision state and versions.",
    "domains": ["events.participation-requests","events.sessions"],
    "create": false,
    "read": true,
    "update": false,
    "delete": false,
    "execute": false
  },
  {
    "actionId": "events.participation-requests.confirm",
    "method": "POST",
    "route": "/api/admin/sites/:siteId/participation-requests/:requestId/confirm",
    "scope": "site",
    "admission": "admin",
    "shortDescription": "Confirm participation",
    "description": "Transitions a pending request to confirmed and moves its full quantity from held to confirmed places in the same transaction. The command uses an expected request version and an idempotency key.",
    "domains": ["events.participation-requests","events.sessions"],
    "create": false,
    "read": false,
    "update": true,
    "delete": false,
    "execute": false
  },
  {
    "actionId": "events.participation-requests.decline",
    "method": "POST",
    "route": "/api/admin/sites/:siteId/participation-requests/:requestId/decline",
    "scope": "site",
    "admission": "admin",
    "shortDescription": "Decline participation",
    "description": "Transitions a pending request to declined and releases its held places in the same transaction. The command uses an expected request version and an idempotency key.",
    "domains": ["events.participation-requests","events.sessions"],
    "create": false,
    "read": false,
    "update": true,
    "delete": false,
    "execute": false
  }
]
```
