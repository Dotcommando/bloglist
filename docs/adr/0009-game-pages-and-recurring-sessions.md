# ADR 0009: Game content as pages and editable recurring sessions

Date: 2026-10-24

Status: Accepted by the owner. Supersedes the separate Game content capability
in ADR 0004 and the G1-G4 workflows in the scenario specifications.

Implementation amendment: ADR 0010 resolves the open recurrence, transition,
booking-retention and rolling-generation policies below. The legacy Game source
contracts described in this historical decision have now been removed/adapted.

## Decision

A game is an ordinary CMS Page. Use a site-owned GameDetail template, normal
page editing/publication and independent routing. Its title, body, SEO, card
summary, expandable text and card/hero image roles have one authoritative source
in that Page and its typed template parameters. No separate Game entity,
gameId, game-content repository or game CRUD application capability is needed.
GameDetail is a template choice, not a new hardcoded PageType in the CMS core.

The homepage's registered Build loader selects published game pages from the
publication input, prepares ready media and routing-derived links, and passes
typed view models into the shared GameCard chunk. Detail pages render the same
page content. Drafts and private originals remain private. An administrative
GetPage/ListPages result is not a public data source. Do not require another
HTTP endpoint or an executable snippet for this read composition.

Keep scheduling and participation as an optional site capability, under the
existing participation ownership boundary. It owns:

| Concept | Responsibility |
| --- | --- |
| Session series | Default owned game-page reference, editable recurrence, local start time, IANA time zone, duration and capacity |
| Session | A specific occurrence with stable sessionId, actual start/end, owned pageId, capacity, occupancy and lifecycle state |
| Participation request | A request for a concrete sessionId, contact person, group quantity, hold and organizer decision |

One page may have several independent series. A session may also be scheduled
once without a series. A series and its sessions reference trusted same-site
pageId values; URLs and template names are not relationship identities. A future
session report is a separate editorial Page and is not created automatically.

## Recurrence and exceptions

Support a weekly pattern such as every Saturday at 11:00, including multiple
series on the same day. The calendar exposes the edit scope explicitly:

- This occurrence only.
- This and following occurrences.
- The whole series.

The organizer can cancel one occurrence or replace its game-page reference
without changing the other occurrences. Keep the effective occurrence override
separate from the series default. Persist exceptions against stable series/
occurrence identity; changing a time or regenerating the calendar must not lose
an exception, resurrect a cancelled session or create duplicate occurrences.
Bookings always reference stable sessionId, not a series, generated list index,
current URL or timestamp that changes on rescheduling.

Recurrence is evaluated in the configured IANA business time zone, preserving
the intended local wall-clock time across seasonal changes. Store concrete
session start/end instants in UTC. Never use the server's local time zone or
generate an unbounded recurring series eagerly. Exact recurrence input/storage,
generation window, retry/concurrency contracts and DST gap/overlap policy must
be agreed before their code is implemented; no RRULE library is selected here.

## Application responsibilities

Keep distinct use cases for scheduling a meeting, creating/editing a recurring
series, changing recurrence with an explicit edit scope, cancelling a specific
session, replacing its game-page reference, requesting participation and making
organizer decisions. These are business operations with capacity, lifecycle and
concurrency rules. They are not generic page edits or loader side effects.
Names and exact port signatures for the new scheduling operations remain to be
agreed; this decision establishes their responsibilities and observable intent.

Pending requests still hold the whole group until organizer decision.
Confirmation converts held places to confirmed places; decline releases them.
Cancellation/replacement behavior for sessions with pending or confirmed requests
is still open: do not silently transfer people to a different game, discard
requests, release holds or invent notification obligations. Changes to a series
must not rewrite past occurrences or booked-session history implicitly. Agree
the precise effects of each edit scope on existing sessions before implementation.

## Consequences and existing code

Retire CreateGame, UpdateGame, GetPublicGame and ListPublicGames from the target
use-case catalog. Page operations and registered published-page loaders provide
their content responsibilities. No new generic content-type framework, games
admin CRUD section or scheduling dependency is added to the rendering core.

The existing src/domain/games and game-specific ports are unimplemented workflow
scaffolding from the earlier design. Participation source contracts still name
gameId/IGameBookingLookupPort and lack recurrence/cancellation/replacement
contracts. They must be explicitly adapted to page references and the new
scheduling rules in a subsequent authorized code task. Never treat legacy gameId
as an unchecked alias for pageId or claim the current contracts implement this
decision. The twenty completed core use cases are unchanged by this document.

The Svelte/Bits UI calendar/detail/table composition remains the intended admin
approach. Add the new scheduling commands and edit-scope controls through that
mechanism when its contracts and UI are implemented.
