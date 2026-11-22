# Proposal: Declarative administration sections

Date: 2026-10-24

Status: Proposed design for discussion; not an accepted operation contract or an
implemented administration framework.

## Goal

Let a site introduce administration sections for custom business data without
writing a new Svelte UI plugin for every site. The first consumer is the
psychologist's scheduled games and participant requests. Preserve the accepted
`src/` backend and `admin/` Svelte + Vite + Bits UI application boundary.

The accepted [ADR 0009](../adr/0009-game-pages-and-recurring-sessions.md) places
game content in the ordinary Page editor. This proposal's calendar/detail/table
sections manage series, sessions and participation, not a separate Game CRUD UI.
Their exact UI schema remains proposed. Backend page-linked series/edit commands
now follow [the implemented contracts](media-and-session-scheduling.md).

## Three responsibilities

1. The CMS admin provides a section registry, navigation/routing, query state and
   reusable view components: Calendar, Table, Detail and Form. It owns shared
   filters, pagination, selection, dialogs and loading/empty/error behavior.
2. A declarative section definition selects registered views and operations,
   maps declared data fields and specifies filters, links, fields and actions.
3. Backend capabilities provide business queries and commands through existing
   inbound ports and authorized REST adapters. They own permissions, validation,
   availability, capacity and booking transitions.

Bits UI provides accessible headless primitives. Its Calendar is a date/calendar
interaction component, not an existing game-event scheduler or participant list:
[Calendar documentation](https://www.bits-ui.com/docs/components/calendar).
Build the reusable event display and table/form composition once in the CMS,
using Bits UI primitives and semantic HTML. This initial shared implementation
is required even when site-specific UI plugins are avoided.

## Section definition contract

Use a versioned, serializable schema with stable section/view IDs, title/icon
registry keys, navigation placement, admin route, component type, query bindings,
field mappings, filters, selection/navigation behavior and allowed commands.
Object-shape interfaces and enum-backed closed options follow repository rules.
The examples below illustrate serialized values, not final TypeScript interfaces.

Definitions reference registered component and operation IDs. They do not contain
JavaScript expressions, functions, Svelte source, database queries, arbitrary
module imports or caller-chosen service URLs. Bindings use constrained typed
references to allowed route/filter/selection fields rather than eval or free-form
expressions. Validate definitions, mapped fields and input/output compatibility
before exposing a section; unsupported references fail explicitly.

Illustrative calendar section:

```json
{
  "schemaVersion": 1,
  "id": "games.calendar",
  "title": "Game sessions",
  "path": "/admin/game-sessions",
  "view": {
    "component": "Calendar",
    "query": "games.sessions.list",
    "inputs": {
      "rangeStart": { "from": "calendar.rangeStart" },
      "rangeEnd": { "from": "calendar.rangeEnd" },
      "pageId": { "from": "filters.pageId" }
    },
    "onSelect": {
      "open": "games.session-detail",
      "params": {
        "sessionId": { "from": "selected.id" }
      }
    }
  }
}
```

The companion `games.session-detail` view is a registered Detail composition,
with a session summary and a Table bound to `games.requests.list`, filtered by
the selected `sessionId`. Proposed row actions reference
`games.requests.confirm` and `games.requests.decline`. Each operation is separately
registered with its typed input/result, permission policy and REST mapping.
The JSON itself cannot register or implement a backend capability.

Initially define sections in trusted typed configuration under
`admin/src/sections/` and validate the serialized result. Adding a section through
configuration may require rebuilding the admin bundle, but no new Svelte view is
needed when existing components cover it. A later admin editor can create/save
the same validated definitions as site-scoped data, restricted to the allowed
component/operation catalog. A visual drag-and-drop builder is not a prerequisite.
This proposal does not assume that server operation registration becomes editable
by an ordinary content administrator.

## Query and command execution

For admin reads, use live query/data-source bindings. They share typed application
queries with public loaders where the contracts and permissions actually match;
they are not build-phase template tags. Admin view data is not included in public
publication artifacts. Keep participant/contact data in authorized admin queries.
The browser calls registered REST endpoints through a common typed client.

Query registrations declare accepted filters, pagination, ordering, result schema
and projection into the view model. A Calendar view needs a stable event ID,
title, start/end instants and links to relevant details. A Table needs stable row
identity, columns and pagination metadata. Use transport/view DTOs at the adapter
boundary rather than exposing domain entities or allowing raw repository access.
Do not impose one generic CRUD repository or generic entity controller on all
business capabilities.

Commands are explicit business actions, not loader side effects or arbitrary
field patches. Define their preconditions, validation/conflict outcomes and retry/
concurrency semantics with the owner before implementation. Successful actions
declare which related query bindings to refresh: confirmation/decline refreshes
the request table, session summary and calendar occupancy. Handle stale responses
and route/filter changes in the shared admin runtime. No polling, streaming,
drag-to-reschedule or inline capacity editing is assumed by default.

Hiding a menu item or action is only UI behavior. Every endpoint independently
validates the actor, trusted site, requested object ownership and permission for
the operation. Use site/actor/input-scoped query state; switching site or signing
out clears inappropriate cached results. Definitions and field mappings cannot
grant access that their backing API forbids.

## Scheduling controls

The series/session form selects an owned game page and supports one-off and
recurring scheduling. Recurrence edits expose an explicit scope: this occurrence,
this and following, or the whole series. Calendar/detail actions can cancel an
occurrence or replace its game-page reference. Stored exceptions survive calendar
regeneration. Game content opens the ordinary Page editor; it needs no separate
game CRUD section. Existing-booking effects and exact command contracts still
require agreement under ADR 0009 before these actions are enabled.

## First admin workflow: Calendar to requests

1. The organizer opens Game sessions and selects a date range/game filter.
2. The Calendar query returns sessions intersecting the visible range, with
   authoritative capacity, confirmed places, held pending places and free places.
   Include sessions crossing range boundaries. Display in the configured IANA
   business time zone and convert range boundaries explicitly to UTC.
3. Selecting a session opens its details and participant-request table. Display
   pending and confirmed records distinctly; do not label every requester as a
   confirmed participant. Show each request's quantity and required contact
   person's name, phone and email under the relevant permissions; do not invent
   individual names for unnamed group members.
4. Confirm/Decline commands act on the selected pending request. Confirmation
   converts its held place to a confirmed place without consuming capacity twice;
   decline releases it. Repeated/concurrent decisions preserve those invariants.
5. The runtime refreshes related bindings and reports the actual command outcome.
   Validation/conflict errors preserve useful context and allow a current-data
   reload. Network retries do not create another booking or repeat capacity effects.

Proposed first Calendar presentation: month/date navigation with session indicators
and an agenda list for the selected date/range, plus the detail/table view. A
full time-grid scheduler can later be added as one reusable view component if
required. This avoids making advanced scheduling interactions a prerequisite
for simply reviewing sessions and participants.

## Extension and implementation boundaries

Shared view/runtime code belongs in `admin/src/`; business use cases, ports and
REST adapters stay in the existing backend layers. Admin section paths are
browser application routes and are separate from the public Page/Url registry.
Public MODX-style template/chunk syntax does not become an admin component DSL.
Site section configuration selects capabilities; it does not introduce a second
backend framework or a new application/domain layer.

Use a narrowly scoped custom view extension only when the reusable components
cannot express a real requirement. New generic components need actual consumers;
do not build an unlimited dashboard/no-code platform in advance. The proposed
first slice needs navigation, Calendar/Detail/Table composition, read bindings and
explicit confirm/decline commands. Form composition can be introduced with the
first agreed editing/create-session use case.

Before implementation, agree the definition schema, registered operations and
observable behavior. Test invalid configuration, site isolation, calendar range/
time-zone boundaries, dependent query inputs, query refreshes, permissions and
held-capacity transitions at their observable boundaries.

The proposed [scenario domain/port map](scenario-001-domains-and-ports.md) places
session/request invariants in `participation`. Operation IDs such as
`games.requests.confirm` in this document are UI registry keys mapped to those
ports, not instructions to put participation persistence in the game catalog.
