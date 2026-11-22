# Scenario 001: Psychologist's games site

Status: Captured owner requirements and follow-up answers; implementation pending.

Implementation update (2026-10-28): scheduling and booking belong to the separate
site installation and its participation add-on. The clean CMS does not install
them; see [ADR 0037](../docs/adr/0037-clean-cms-and-site-installations.md).
The complete site-specific presentation below remains a separate scope. Later accepted
scheduling/participation contracts supersede historical open policy notes here.

Date: 2026-10-24

The owner accepted games as ordinary pages and editable recurring sessions in
[ADR 0009](../docs/adr/0009-game-pages-and-recurring-sessions.md). This supersedes
the earlier separate Game content entity; scheduling code/contracts are pending.

## Goal and actors

A psychologist presents the games she facilitates. A visitor discovers a game on
the homepage, reads progressively more detail and requests a place at a scheduled
session. The organizer reviews the request and confirms or declines it.

Actors: visitor, organizer/site editor, and CMS publication/booking workflows.
This is a use-case specification, not a task plan or implemented feature report.

## Confirmed requirements

- The homepage is a page with its own template and includes a header.
- It presents a list of games using the same parameterized chunk for every game.
- Each game card supports expanding an additional description in place.
- A separate native link opens that game's dedicated page with a more detailed
  description. Expansion and navigation are separate controls.
- Each card has an Order action, displayed as `Заказать` in a Russian interface.
  It opens a form whose Game select already has that game selected.
- Each game has at least two independently assigned image roles: its homepage
  card image and its dedicated page's header/hero image.
- The visitor books a place on an already scheduled session of the selected game;
  this scenario does not ask the visitor to choose arbitrary free calendar time.
- Submission creates a request awaiting organizer confirmation. It temporarily
  occupies all requested places until the organizer decides. Submission alone is not a
  confirmed booking.
- A request can cover multiple participants. The form asks for the quantity and
  requires the contact person's name, phone and email.
- Future nested pages may describe individual completed sessions of a game.
  Their actual implementation/content is outside the initial public-page scope.
- Pages and routing follow the independent Bloglist-compatible model. Clusters
  are not required for this site.
- A game is an ordinary Page with a GameDetail template and typed parameters;
  there is no separate game-content record or game CRUD workflow.
- Sessions can be one-off or repeat through an editable series, for example
  every Saturday. Several games/series can be scheduled on the same day.
- The organizer can cancel one occurrence or replace its game without changing
  the others. Editing offers this occurrence, this and following, or the whole series.

## Content, routing and scheduling concepts

These are conceptual responsibilities, not final database schemas or port signatures.

| Concept | Responsibility |
| --- | --- |
| Page | Stable page identity, site/language, content, template and publication state |
| URL | Independent site-relative address that serves a page or redirects to another URL; retains history |
| Game page | An ordinary Page whose template parameters provide card/disclosure content and card/hero media references; pageId is its stable identity |
| Session series | Default game-page reference, recurrence, local time, IANA time zone, duration and capacity |
| Scheduled session | A concrete occurrence with stable sessionId, effective game-page reference, start/end, capacity and lifecycle state |
| Booking request | A visitor's request for a place at a session, awaiting organizer review |
| Session report page | Optional future public story about a completed occurrence; distinct from operational booking data |

A game page is not identified by its current URL. Prepare links through routing.
Renaming/rebinding a URL does not change pageId or the sessionId of a request.
Series/sessions reference owned pageId values; requests reference sessionId.
Do not assume every scheduled session automatically has a public report page.

Illustrative URL structure; final slugs, language prefixes and trailing-slash
policy remain to be agreed:

```text
/                                  -> homepage Page
/<game-slug>/                      -> game detail Page
/<game-slug>/<report-slug>/         -> optional future session report Page
```

URL parent relationships can express this hierarchy without clusters or a new
requirement for page-parent fields. A URL hierarchy is not a booking relationship.
The owner requires ordinary pages and no reserved /games prefix or separate Game
content domain. Routing choices do not identify a session or participation request.

## Editorial preparation and publication

1. The editor creates the homepage, assigns its own Home template and manages its
   URL independently in routing.
2. The editor creates ordinary game pages with titles, short card summaries,
   expandable descriptions and full detail-page content. Template parameters hold
   the card/disclosure fields and image roles; Page holds the body and SEO.
   Do not create a second Game record. Proposed addition: explicit
   display ordering of games on the homepage.
3. The editor uploads and assigns a card image and a hero image for each game.
   The role references are independent, so changing the card image does not
   accidentally replace the hero. Both must be ready for publication.
4. Each game detail page uses a reusable GameDetail template with that game's
   data. Proposed addition: reuse the site Header and booking-form components
   across the homepage and detail pages.
5. The editor reviews a protected preview and publishes a coherent snapshot of
   pages, URL bindings, chunks and media. Drafts do not appear in the public list.
6. Scheduled sessions are managed as live booking data. Changing capacity or
   accepting a request does not require rebuilding the marketing pages.

The initial site language, public game names, actual descriptions, branding,
contact details and exact URL slugs are content decisions still to supply.

## Organizer flow: Recurrence and occurrence exceptions

1. Select an owned game page and schedule a one-off session or a recurring series.
   A series defines recurrence, local start time, IANA time zone, duration and
   default capacity. One page can have multiple series.
2. For example, Game A repeats on Saturdays at 11:00 and Game B on Saturdays at
   15:00. These are independent series, not additional public content records.
3. Editing explicitly selects this occurrence, this and following occurrences,
   or the whole series. Do not silently apply a one-date edit to the full series.
4. Cancelling one Saturday preserves the occurrence identity and cancellation;
   recalculating the calendar must not resurrect it. Replacing one Saturday's
   game overrides its page reference while leaving other occurrences unchanged.
5. Requests always belong to a concrete stable sessionId. Moving an occurrence
   or changing a URL must not orphan requests or allocate duplicate sessions.
   Persist exceptions against their originating series/occurrence identity.
6. Evaluate recurrence in the series' IANA zone, preserving local wall-clock
   time across seasonal changes; concrete session start/end values are UTC.
   Do not generate an infinite recurrence eagerly or depend on server local time.

Scheduling, changing recurrence, cancellation, game replacement and participation
commands are distinct application behaviors in the optional participation module.
Ordinary page editing owns game descriptions. Cancellation/replacement effects
on existing pending/confirmed requests, exact scope-change behavior and DST
gap/overlap handling require contracts before implementation. Do not silently
transfer attendees, release holds or promise notifications.

## Visitor flow A: Browse the homepage

1. The visitor opens the homepage through its published URL.
2. Initial HTML contains the header, game cards, summaries, images and detail-page
   links. The same GameCard chunk renders every record with different parameters.
3. The visitor expands a card and reads its additional description without
   leaving the page or making a backend request. Collapsing restores the compact
   view. Proposed default: cards expand independently rather than forcing a
   single-open accordion.
4. A dedicated link opens the game detail page. Opening a new tab and normal
   browser navigation continue to work.

Proposed accessibility addition: use a native details/summary or an equivalent
keyboard-accessible disclosure. If the content is already known at publication,
include it in initial HTML. Card expansion does not open the order form and the
Order button does not accidentally toggle the card or follow its detail link.

## Visitor flow B: Read a game detail page

1. The visitor follows a card link or enters a game's URL directly.
2. The correct game title, full description and assigned hero image appear in
   the initial HTML, using a GameDetail template distinct from Home.
3. Proposed addition: a clear route back to the game list and an Order action
   with the same game preselected, so a direct visitor can request a place too.
4. Future completed-session report links can appear here when that content is
   introduced. Do not add empty report pages or publish participant information
   merely to establish the future URL structure.

## Visitor flow C: Request a place at a scheduled session

1. The visitor selects Order on a game card, or on the game detail page when that
   proposed action is included. One shared form component/dialog opens.
2. The Game field is a real select containing eligible published/bookable game pages,
   with the initiating page selected by pageId. Give every form/disclosure
   instance valid unique DOM identifiers.
3. The form loads current sessions for that game through its declared API. The
   visitor explicitly chooses an eligible scheduled session; show the date, time,
   relevant business time zone and availability. Exact session-picker UI is open.
4. Changing the Game select clears the previous session selection and refreshes
   sessions for the new game. Ignore stale responses from an earlier selection.
5. The visitor supplies a positive integer participant quantity and the required
   contact person's name, phone and email, then submits. Required acknowledgements
   and exact validation/normalization rules remain open.
6. The server validates trusted site scope, game/session relationships, booking
   eligibility and available capacity. It atomically creates an awaiting-review
   request and holds the entire requested quantity. A displayed availability count is not
   proof that a place is still available at submission time.
7. Only after durable acceptance does the form show a request reference and a
   clear awaiting-organizer-confirmation message. Do not show a confirmed-session
   success message or promise that an email/message was sent without that outcome.

Proposed interaction additions: focus enters the dialog, Escape/close work,
keyboard focus returns to the opener, loading/errors are announced accessibly,
and the form remains usable on mobile. Reopening from a different game updates
the selection deliberately; define draft-contact preservation during UI design.

## Organizer review and held capacity

1. The organizer sees an awaiting-review request with game, scheduled session,
   contact information, group quantity and held places in an authorized view.
2. Confirmation converts the hold into a confirmed booking without consuming
   additional places. Declining releases the hold. Repeated or concurrent decisions
   must not double-release or double-count capacity.
3. Public availability excludes both confirmed places and pending held places.
   Concurrent submissions cannot allocate the same last available place.
4. The owner selected holding the place until the organizer's decision. Do not
   introduce automatic hold expiry or a payment prerequisite as an unstated rule.
   Session cancellation/start and any later expiry policy need explicit contracts.
5. Required organizer/visitor notifications and delivery channels remain open.
   A delivery failure must not silently create a second booking or lose the request.

Group requests are supported; a single request may occupy multiple places. The
maximum permitted quantity and the organizer's capacity-management rules remain
open details. A contact person is not a complete named roster of every group
member; collecting individual participant names would be a separate requirement.

## Organizer flow: Calendar and participant requests

The organizer needs an admin section for viewing scheduled game sessions in a
calendar, selecting a session and inspecting the people who requested places.
Show pending requests separately from confirmed participants, including their
held places. Confirmation and decline remain authorized business commands.

The requested CMS direction is to compose such sections from reusable admin UI
components and declared data sources/actions, avoiding a bespoke UI plugin for
every site's business capability. Custom backend queries/commands are still
required. The proposed mechanism and initial calendar/detail/table presentation
are described in [the admin sections proposal](../docs/arch/admin-sections-proposal.md).
That document is a design proposal; exact component/operation contracts and
editing/create-session screens remain to be agreed before implementation.

## Failure and empty states

| Condition | Required observable behavior |
| --- | --- |
| No published games | Deliberate empty-state content; no fake cards or broken links |
| Selected game has no eligible sessions | Explain that no sessions are available; do not allow an invalid submission |
| Session becomes full/cancelled while form is open | Reject the stale selection, refresh choices and preserve valid contact inputs |
| Sessions API is unavailable | Show a retryable failure rather than an empty calendar presented as truth |
| Invalid contact input | Identify fields accessibly and preserve entered values |
| Double click, retry or response lost after acceptance | Idempotent processing returns the same request/hold for the same operation |
| Request persistence or capacity hold fails | No partial successful booking; reconcile partial external effects explicitly |
| Required image variant/loader/publication step fails | Do not activate an incomplete release; retain the previous publication |

## Image handling and CLS

Use the agreed S3-compatible media adapter and upload-time processing. Card and
hero assets each have responsive coverage at 576, 768, 992 and 1200px plus the
320px baseline and 1440px cap, without upscaling small originals. Persist actual
dimensions and aspect ratios for originals and all variants.

Emit initial image width/height and structural CSS to reserve the intended space.
Derive srcset from actual variant widths and sizes from the card grid/hero layout.
If the two image roles use different crops, reserve each role's actual ratio.
Verify image loading does not unexpectedly move existing content. Intentional
card expansion is distinct from an unexpected loading-induced layout shift.

## Rendering and API interaction

Home and GameDetail normally use Static delivery with Api interaction. Build
loaders prepare published page/card/detail content and canonical route links; they
do not calculate live availability or create bookings. A loader inside a chunk
may receive game parameters under the existing typed/local-scope rules.

The homepage loader selects published pages using the site's game-template
configuration. Detail rendering uses that same Page. Neither reads a separate
Game repository nor exposes GetPage/ListPages administrative drafts publicly.

The GameCard chunk's proposed input roles are pageId, title, summary,
expandable text, prepared card-image metadata, resolved detail URL and public
booking configuration. The form receives the initiating pageId as a
parameter. Exact contracts will be agreed before implementation.

Browser JS handles disclosure where necessary, opens/prefills the form, fetches
sessions on demand and submits the booking command. The form declares its API
dependencies and browser entry; it does not require a request-phase template
loader. Initial homepage/game-content rendering does not fetch a business API.

## Independent URL lifecycle and future compatibility

Editing game content or changing templates does not recreate the page or URL.
Address changes preserve the page identity and route history. A removed/archived
page's URL is not automatically deleted. The editorial workflow explicitly:

- turns the retained URL into a redirect to an appropriate owned URL; or
- rebinds it to a replacement page while preserving its URL identity/history.

If neither choice applies, agree a deliberate unavailable-route policy before
removal. Do not silently redirect every deleted game to the homepage. Check all
affected child URLs, incoming links and published artifacts; do not cascade-delete
future report routes merely because a parent page is archived. Avoid cross-site
targets, redirect cycles and partial release switches.

Bloglist already has separate Page/Url entities and initial/change-address/history
operations. Its page-removal/rebinding workflow is not assumed implemented.
Preserve nullable cluster compatibility without requiring clusters for this site.
See [ADR 0003](../docs/adr/0003-pages-and-independent-routing.md).

## Acceptance examples

- With at least two published games, the homepage uses one GameCard chunk and
  displays each game's own text, image and detail link without scope leakage.
- Expanding either card reveals its own description and leaves navigation and
  Order as separate functioning actions.
- Ordering Game B opens the form with Game B selected; choosing Game A refreshes
  sessions and cannot submit a stale Game B session.
- Visiting a detail URL directly renders the correct full content and hero image.
- A valid request for the last place becomes pending and holds it; a competing
  request receives an availability conflict. A retry does not take another place.
- A group request for three people holds three places or fails without a partial
  reservation. Confirmation consumes no additional places; decline releases all
  three. Missing name, phone or email is a validation error.
- Confirmation counts the held place once; declining releases it once.
- Changing a page URL or rebinding a retained URL does not retarget existing
  sessions or requests. pageId/sessionId and redirect history are preserved.
- Cancelling one occurrence of a weekly series leaves other dates available;
  calendar regeneration does not recreate the cancelled occurrence.
- Replacing one occurrence's page reference changes only that occurrence's game.
  Existing request disposition follows an explicit policy, never a silent transfer.
- Several independent series can reference one page, and one-off sessions need
  no series. Local recurrence time is preserved across seasonal clock changes.
- No cluster configuration is required for any flow in this scenario.
- Initial content works as static HTML, production JS handles interactions, and
  late image loading preserves reserved geometry at the agreed responsive widths.

## Open details before implementation

- Contact validation/normalization, visitor channel and organizer notifications.
- Capacity per session, maximum group quantity and cancellation/
  replacement/rescheduling effects on pending and confirmed bookings, including
  session start, historical records and the three recurrence edit scopes.
- Exact recurrence contracts, generation window, and daylight-saving gap/overlap
  policy. Weekly recurrence and occurrence exceptions themselves are accepted.
- Initial language, actual content, homepage ordering and canonical URL convention.
- Whether to adopt the proposed detail-page Order action, shared form/header,
  independent disclosure behavior and return-to-list navigation.
- Future report-page content, publication policy and treatment of affected child
  routes when a game page is removed. Reports remain a later extension.

Payment, waiting lists, arbitrary-time appointments and SEO cluster management
are not assumed requirements of this first scenario.

See the [domain boundaries and port contracts](../docs/arch/scenario-001-domains-and-ports.md)
for the implemented domain/port foundation and legacy-contract adaptation notes.
Core rendering/public HTTP is implemented; scheduling/participation workflows,
live booking APIs, media storage/processing and the admin UI remain future work.
