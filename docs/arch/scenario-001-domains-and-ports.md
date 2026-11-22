# Scenario 001: Domain boundaries and port contracts

> Historical implementation scope. This document records an early development
> boundary, including optional business capabilities. For current operation use
> the [developer guide](../guide/en/README.md) and maintained capability contracts.
> It does not authorize installing business code in the clean CMS distribution.

Date: 2026-10-24

Status: Capability boundaries and domain/port implementation authorized by the
owner on 2026-10-24. The foundation is implemented under `src/domain/` and
`src/ports/`. The initial five application operations and site/page adapters now
follow [ADR 0005](../adr/0005-initial-local-application-boundary.md) and the
[local application contract](local-application.md). All 51 currently declared use
cases are implemented; later sections retain historical proposals where explicitly
superseded by the linked ADRs. Administrative frontend and remaining REST adapters
are separate work.

Application workflows and the contract decisions needed before implementing them
are specified in [scenario 001 use cases](scenario-001-use-cases.md).
The initial local-operator boundary, archived-site semantics and full site/page
repository implementation scope were accepted in
[ADR 0005](../adr/0005-initial-local-application-boundary.md). Page editing, the full
routing repository and optional atomic subtree moves follow
[ADR 0006](../adr/0006-working-routing-and-page-editing.md); remote authentication
and unrelated workflow decisions remain outside these scopes.
The third five operations implement direct publication and browser preview under
[ADR 0007](../adr/0007-simple-page-publication-and-releases.md). Its one-draft,
three-published-versions model supersedes earlier source-revision and editorial
approval proposals in this foundation document. See
[current rendering contracts](rendering-and-publication.md).

[ADR 0009](../adr/0009-game-pages-and-recurring-sessions.md) supersedes the
separate Game content domain: games are ordinary Pages, while series/sessions
and participation are optional. Game scaffolding has been removed. The fifth
batch implements media and page-linked series/schedule changes under
[ADR 0010](../adr/0010-local-media-and-rolling-session-schedules.md) and
[the current contracts](media-and-session-scheduling.md). Cancellation, replacement
and booking are implemented under ADRs 0013/0014. Site editing, archival and
retained-URL behavior follow [ADR 0015](../adr/0015-site-lifecycle-and-retained-url-behavior.md)
and [their contracts](site-editing-and-url-behavior.md).

Sources: [scenario 001](../../scenarios/001-psychologist-games-site.md),
[admin sections proposal](admin-sections-proposal.md), and ADRs
[0001](../adr/0001-admin-application-layout.md),
[0002](../adr/0002-media-storage-and-responsive-images.md) and
[0003](../adr/0003-pages-and-independent-routing.md).

## Confirmed business rules

- Public Home and GameDetail documents are normally statically published. Card
  disclosure is local interaction; session selection and booking use live APIs.
- Pages and URLs are independent, site-scoped entities; clusters are optional.
- Each game has a card image and a separate hero-image assignment. Images have
  upload-generated responsive variants and actual dimension metadata.
- A visitor selects an already scheduled game session, supplies a positive
  integer number of participants, and provides name, phone and email.
- An accepted request is Pending and holds its entire requested quantity until
  the organizer decides. Confirmation converts held places to confirmed places;
  declining releases them. Never allocate a partial quantity without a new rule.
- No automatic hold expiry, immediate confirmation or payment dependency is assumed.
- Admins need calendar sessions, request/participant views and confirm/decline
  actions through their authorized operations.

## Capability and ownership map

These are logical ownership boundaries in one backend, not separate services or
capability roots duplicating the architectural layers.

| Capability | Ownership | Boundary |
| --- | --- | --- |
| `sites` | Site identity, domain mapping, enabled languages and site settings | Generic CMS |
| `pages` | Page identity, editorial content/SEO, draft/published/archive state and template/data bindings | Generic CMS; Bloglist baseline |
| `routing` | URL identity/path/parent, PAGE or REDIRECT behavior, page binding and history | Generic CMS; Bloglist baseline |
| `publication` | Coherent source snapshot, compiled release, validation, activation and rollback references | Generic CMS |
| `media` | Assets/versions, ownership/visibility, actual dimensions, variants and processing lifecycle | Generic CMS |
| Game pages | Ordinary Page content, site-owned GameDetail parameters and card/hero media references | Uses generic pages/routing/publication; no separate capability |
| `participation` | Recurring series, concrete page-linked sessions, exceptions, capacity, requests, holds, decisions and receipts | Optional site business extension |

The engine must work without scheduling and participation. Those extensions use
the same `src/domain`, `app`, `ports`, `adapters` and `infra` layers; they do not
require a plugin runtime or separate application. No core CMS contract names a
Game or BookingRequest. Publication reaches business data through declared,
registered loader bindings.

Rendering is an application/technical capability within publication: discovery
of dependencies, loader orchestration, composition and frontend compilation.
The template engine is an outbound adapter. A data loader, calendar, endpoint,
Svelte component or generic CRUD service is not a business domain by itself.
Admin section definitions remain a proposed UI integration contract, not a new
owner of game/session state. Authentication provider and administrative identity
management are supporting integrations to agree, not permission to scaffold IAM.

### Important ownership choices

- A game is an ordinary Page using GameDetail. Title, body, SEO, card summary,
  expandable description and image roles have one authoritative Page/typed-
  parameter source. No Game record, pageId or new hardcoded PageType is required.
- Session series, concrete sessions and BookingRequest belong to `participation` together. This
  capability owns the invariant connecting their state and seat counts; do not
  split scheduling and reservation into independent services/repositories with
  unrelated saves.
- A session stores capacity, held/confirmed place totals and a concurrency
  version. Requests are separately addressable records; the session does not
  embed an unbounded participant array.
- Series/sessions reference owned pageId; requests reference stable sessionId.
  A page may have multiple series, and a one-off session needs no series.
  Keep recurrence in local wall-clock time with an IANA zone and concrete
  instants in UTC. Persist per-occurrence cancel/replace exceptions and explicit
  edit scopes without recreating sessions or implicitly moving booked attendees.
- A group request records a contact person and quantity. Those values do not
  identify every individual in the group. Individual participant-name collection
  is not agreed and must not be invented by the admin table.
- Session report pages are future editorial Page records. They are not the
  operational session entity or a reason to add clusters now.

## Contract conventions

One inbound port per initiated operation, implemented by a use case. Example
`IRequestParticipation.execute(input)` belongs in
`ports/inbound/participation/request-participation.port.ts`; its use case belongs
in `app/use-cases/participation/request-participation.use-case.ts`. Domain-owned
input/result values and errors keep contracts independent of NestJS and drivers.

Administrative context contains trusted actor/site identity established by the
inbound adapter. Application operations enforce their required permission policy;
neither a submitted siteId nor a visible UI button establishes authorization.
Public operations receive a site resolved from configured domain mappings. Never
accept a caller-chosen actor/site as authority. Authenticate/authorize every retry
before returning an existing private result.

Use stable opaque entity IDs and detached domain snapshots, with no provider
types or mutable references to persisted entities. Read results are either a
documented entity/projection or null; required references on commands fail
explicitly. New paged queries return items plus an opaque next cursor, with
explicit limit/sort inputs. Approved numeric limits belong in the transport-limit
specification before implementation. Never silently truncate a calendar range.
Do not retrofit pagination into unchanged Bloglist list contracts implicitly.

Expected business failures are typed domain errors; technical storage/service
failures remain distinct and are translated at their owning adapter boundaries.
No partial success is represented as a complete successful result. DTO-to-HTTP
error codes and wire encodings are separate transport contracts to agree.

## Generic CMS inbound port catalog

The tables record input/result responsibilities. Source interfaces define the
current exact shapes. Review any changes and resolve affected open policies
before implementing application use cases or transport/persistence adapters.

| Capability / inbound operation | Input | Result / failure behavior |
| --- | --- | --- |
| `sites`: `ICreateSite`, `IGetSite` | Authorized platform context and site fields/identity | Site or null for get; normalized-domain/mark uniqueness and validation errors |
| `sites`: `IResolveSite` | Normalized host from a trusted inbound boundary | Site identity/public settings or unknown-site result; reject untrusted proxy metadata |
| `pages`: `ICreatePage`, `IUpdatePage` | Authorized site, editorial fields and declared template/data binding changes | Draft/saved Page; ownership, language, binding and reference errors |
| `pages`: `IGetPage`, `IListPages` | Authorized site, identity or supported filters | Page/null or complete inherited list; no mixed-site results |
| `pages`: `IPublishPage`, `IArchivePage` | Authorized site and Page identity | Editorial Page state only; do not activate artifacts or discard URLs implicitly |
| `pages`: `IConfigurePageRendering` | Authorized site/actor, pageId and rendering configuration | Page with validated delivery/interaction and loader dependency policy; no release activation |
| `routing`: `IAssignInitialPageUrl` | Authorized site, pageId, mark, parentUrlId, segment, path | New PAGE Url; ownership/path/mark/current-binding conflicts |
| `routing`: `IChangePageUrl` | Existing page/site, new address data and 301/308 policy | New PAGE Url; old URL/history updated atomically or no changes |
| `routing`: `IFindUrlByPath`, `IGetUrlHistory` | Authorized site/path or site/urlId | Editorial route/null or owned history; preserve Bloglist scope semantics |
| `routing`: `IRebindUrlToPage` | Authorized site, urlId, replacementPageId and expected URL version | Retained URL identity with a new PAGE target and history; stale/conflicting/foreign target fails |
| `routing`: `IRedirectUrl` | Authorized site, urlId, targetUrlId, redirect status and expected version | Retained URL becomes REDIRECT with history; reject cycles, stale state and foreign targets |
| `publication`: `IPreviewPage` | Authorized site/page and captured draft revision | Protected preview result and diagnostics; no public release activation |
| `publication`: `IPublishSiteRelease` | Authorized site, source revision and expected active release | New active release reference only after a complete successful build/switch; old release survives any earlier failure |
| `publication`: `IResolvePublishedPath` | Trusted site and normalized path | Stored document, request-render plan, redirect or not-found instruction from one active release |
| `media`: `IUploadAsset` | Authorized site, declared filename and bounded binary stream | Asset/version reference and Processing state; actual type/size validation can reject it |
| `media`: `IProcessAsset` | Authorized durable worker context and asset/version | Ready metadata only after verified derivatives; repeatable recovery or Failed diagnostics |
| `media`: `IGetAsset` | Authorized site and asset/version | Scoped metadata or null; private storage details are not a public view model |

Do not redefine Bloglist's exact signatures silently. Its immutable marks,
language rules, PageType, global mark uniqueness and URL semantics must be
reviewed during adaptation. New template/data/media bindings and concurrency
versions are explicit Zarya extensions, not fields claimed to exist already.
Page-mark uniqueness was subsequently agreed as site-scoped in
[ADR 0050](../adr/0050-site-scoped-page-keys.md); site and URL marks retain their
existing global semantics. Cluster references remain nullable and basic module
composition needs no cluster provider. PageType does not choose Static/Request rendering.

Page retirement must prepare an explicit disposition for every affected URL and
child/incoming relationship before archival/removal. Rebind/redirect operations
above provide routing changes, not a complete cross-capability removal workflow.
Its input, atomicity/recovery boundary and unavailable-route policy remain to
agree; do not implement archive-plus-independent-deletes as an equivalent.
Preserve Bloglist's single-current-PAGE-URL constraint: rebinding to a page that
already owns another current PAGE URL is a conflict unless an explicitly agreed
multi-route change resolves it atomically. A redirect is a separate operation.

## Generic CMS outbound ports

| Port | Required contract and adapter responsibility |
| --- | --- |
| `ISiteRepository`, `IPageRepository`, `IUrlRepository` | Capability-owned persistence; preserve agreed lookup/uniqueness semantics, enforce invariants atomically and check site ownership before returning results |
| Routing reference lookups and atomic routing commit | Narrow page/parent reference snapshots, expected-state route changes and durable history; no page repository import inside routing |
| `IPublicationSourcePort` | Capture a versioned graph of approved pages, URL bindings, template/chunk sources and declared public data dependencies |
| `ITemplateCompositionPort` | Prepare a typed dependency plan and compose it from resolved view models; enforce tag scope/escaping without exposing template-engine AST types |
| `IFrontendBuildPort` | Produce the specified CSS groups, minified HTML/assets and minified/obfuscated browser JS; return artifacts, dependency references and diagnostics |
| `IPublicationStorePort` | Stage/read immutable release artifacts and verify hashes; staged output is not active output |
| `IReleaseActivationPort` | Compare expected active release and switch the authoritative release pointer atomically; stale activation fails without switching |
| `IAssetRepository` | Metadata, immutable versions and guarded processing-state changes; no object bytes stored as ordinary MongoDB metadata |
| `IAssetStoragePort` | Write/read/delete bounded asset content by opaque storage references; S3 is an adapter choice, with bucket/SDK/ACL details confined there |
| `IAssetDeliveryPort` | Resolve stable public URLs for owned public derivatives; do not turn private originals into public assets or issue expiring URLs for static HTML |
| `IImageProcessingPort` | Validate/normalize image data and produce required variant content plus actual dimensions/profile mapping; Sharp types stay in the adapter |
| Capability-owned reference/access/time/identity ports where needed | Explicit narrow lookups, permission decisions and deterministic clock/ID values; no global service locator |

Activation is the public consistency boundary: public document resolution reads
the active release's page/route snapshot. Editorial route changes must not become
live merely because an unrelated working URL row was saved. Staging files in S3
or a filesystem is not a distributed transaction with MongoDB; prepare immutable
artifacts first, then switch one authoritative pointer. Retain rollback versions.

Register data loaders in trusted composition as read bindings to explicit
application queries. Phase, typed parameters, result alias and dependency scope
are render-plan metadata. Do not add one HTTP endpoint or persistence repository
per loader, or force internal server composition through its own REST API.

## Site extension inbound ports

The separate game-content ports are removed. Page operations and published-page
loaders own content; series/sessions use owned pageId values and requests use
stable sessionId values. Current implemented scheduling contracts are documented
in [media and session scheduling](media-and-session-scheduling.md).
The participation operations below are implemented under ADRs 0013/0014;
see [session catalog](session-catalog.md) and [participation](participation.md).

| Capability / operation | Input | Result / failure behavior |
| --- | --- | --- |
| `participation`: `ICreateSession` | Authorized site, pageId, UTC start/end, IANA time zone and positive capacity | New scheduled session with zero occupancy; reject invalid interval, foreign/missing game and invalid capacity |
| `participation`: `IListBookableSessions` | Trusted site, pageId, bounded future range and explicit paging | Public session choices and available quantity; no requester identities/contact data |
| `participation`: `IRequestParticipation` | Trusted site, sessionId, places, contact and idempotency key | Minimal Pending acceptance receipt after durable hold/request commit; no partial group allocation |
| `participation`: `IListAdminSessions`, `IGetAdminSession` | Authorized site/actor, game/range filters or sessionId | Session projections with capacity, pending held quantity, confirmed quantity and version |
| `participation`: `IListSessionRequests` | Authorized site/actor, sessionId, optional state filter and paging | Request rows with contact person, group quantity, state and version; names are not an invented roster of every group member |
| `participation`: `IConfirmParticipation`, `IDeclineParticipation` | Authorized site/actor, requestId, expected request version and idempotency key | Recorded decision; repeat/retry and stale-state semantics below |
| `participation`: `IChangeSessionPage` | Authorized site/actor, sessionId, existing pageId and expected version | Replace the game reference while retaining identity, schedule, occupancy and requests |

In the target model, scheduling validates owned page references through an
explicit pages lookup port; media stays owned by the media capability. Public
eligibility reflects published page/session policy, never an administrative
draft or an unchecked browser pageId. Public booking uses active-published-page eligibility.
Calendar queries use a half-open UTC interval `[rangeStart, rangeEnd)`, returning
intersections (`startsAt < rangeEnd` and `endsAt > rangeStart`), including sessions
that cross a boundary. Display uses the session/site's declared business time zone.
The consumer must handle every page or clearly show pagination; one response
page is not implicitly the complete calendar.

Contact normalization, cutoff and authenticated administrator access follow
ADR 0014. Name/phone/email are required; email syntax is validated and normalized,
and phone accepts digits, an optional leading plus, spaces, parentheses and
hyphens without country inference. Booking closes at start. This does not imply
an email-delivery guarantee. Local scheduling follows ADR 0010.

## Implemented participation contracts

The following shapes summarize page-linked source contracts. Scheduling follows
ADR 0010; public booking and decisions follow ADR 0014. All contact fields are
required. `actorId` is an already verified administrator identity from the
authentication boundary, not public request input. Global administrators
currently have access to all sites.

```ts
export enum ParticipationState {
  Pending = 'Pending',
  Confirmed = 'Confirmed',
  Declined = 'Declined',
}

export interface IBookingContact {
  readonly name: string;
  readonly phone: string;
  readonly email: string;
}

export interface IRequestParticipationInput {
  readonly siteId: string;
  readonly sessionId: string;
  readonly places: number;
  readonly contact: IBookingContact;
  readonly idempotencyKey: string;
}

export interface IParticipationReceipt {
  readonly requestReference: string;
  readonly sessionId: string;
  readonly places: number;
  readonly state: ParticipationState.Pending;
  readonly acceptedAt: Date;
}

export interface IRequestParticipation {
  execute(input: IRequestParticipationInput): Promise<IParticipationReceipt>;
}

export interface IParticipationDecisionInput {
  readonly siteId: string;
  readonly actorId: string;
  readonly requestId: string;
  readonly expectedRequestVersion: string;
  readonly idempotencyKey: string;
}

export interface IParticipationDecision {
  readonly requestId: string;
  readonly sessionId: string;
  readonly places: number;
  readonly requestVersion: string;
  readonly decidedAt: Date;
}

export interface IConfirmedParticipation extends IParticipationDecision {
  readonly state: ParticipationState.Confirmed;
}

export interface IDeclinedParticipation extends IParticipationDecision {
  readonly state: ParticipationState.Declined;
}

export interface IConfirmParticipation {
  execute(input: IParticipationDecisionInput): Promise<IConfirmedParticipation>;
}

export interface IDeclineParticipation {
  execute(input: IParticipationDecisionInput): Promise<IDeclinedParticipation>;
}
```

Validate `places` as a positive safe integer before capacity arithmetic. The
entire requested group must fit. Name/phone/email are validated and normalized
under an agreed policy; phone parsing must not infer the server's country.
The reference is opaque, and the public receipt contains no contact fields or
authorization to retrieve them. An idempotency key is not admin authentication.
The acceptance receipt is the original Pending acceptance snapshot; replay is
not a public live-status lookup after an organizer later changes the request.

### Capacity transitions

For safe-integer capacity C, held places H and confirmed places F:

```text
available = C - H - F
C > 0; H >= 0; F >= 0; H + F <= C

request q places:        H := H + q; create Pending request
confirm Pending q:      H := H - q; F := F + q; request := Confirmed
decline Pending q:      H := H - q; request := Declined
```

Every transition updates the session version and request state/version in one
atomic persistence boundary, with the matching idempotency receipt. The public
request becomes successful only after the hold and request both commit. No
logical split can accept a request without its hold or consume the hold twice.

### Participation outbound boundary and retry behavior

Use one capability-owned `IParticipationStorePort` for session/request snapshots,
query projections and atomic expected-version commits. It may be split into
narrow read/write interfaces during agreed implementation, but must preserve
one atomic hold/decision contract. Do not introduce independent generic session
and booking save operations as a substitute for this boundary.

The proposed commit methods are:

| Method | Business arguments | Atomic guarantee |
| --- | --- | --- |
| `commitRequest` | Trusted site, expected session version, next domain-validated occupancy, new Pending request and operation receipt | Session change, request creation and receipt all commit or none do |
| `commitDecision` | Trusted site, expected session/request versions, next domain-validated occupancy/request and operation receipt | Occupancy, request state/version, audit decision and receipt all commit or none do |
| `findOperationReceipt` | Trusted site, operation/key and caller scope where applicable | Return the saved receipt and canonical-input identity, or absent; never another site's receipt |

The use case/domain computes and validates transitions. The adapter enforces
uniqueness and expected-state atomicity; it does not invent capacity decisions.
MongoDB transactions and storage error translation stay inside the adapter.
The port does not expose database sessions, updates/operators or client objects.

Bind idempotency to site, operation, relevant actor scope and a canonical identity
of the validated semantic input. The same key/input returns its original outcome;
the same key with different semantic input fails with IdempotencyConflict.
Parallel same-key submissions resolve to the one durable operation. Check replay
before stale-version preconditions, after authorization/input validation. Never
log or return a raw contact-bearing fingerprint; define privacy/retention policy
when implementing durable operation receipts.

For a new decision operation, check expected version and require Pending.
Opposite terminal decisions are invalid transitions. A repeated original command
with its original key replays its result without capacity effects; a fresh key
does not bypass current state/version checks. A concurrent stale session update
is a conflict; any bounded retry must reload and revalidate every affected domain
condition. Do not silently retry booking writes or partially reserve a group.

### Proposed failure taxonomy

| Failure | Observable contract |
| --- | --- |
| Validation | Invalid quantity/contact/interval/parameters; no writes |
| NotFound | Missing required page/series/session/request in its authorized scope |
| Forbidden / Scope | Actor lacks permission or a reference crosses the trusted site; no foreign data returned |
| NotBookable | Session or associated published page fails the agreed eligibility policy |
| CapacityUnavailable | Full requested quantity does not fit; no request/partial hold |
| IdempotencyConflict | Reused operation key with different semantic input |
| StaleWrite | Expected version is no longer current; no partial commit |
| InvalidTransition | A new operation attempts an unsupported request-state change |
| Dependency/storage failure | No success claimed; query failure is distinct from an empty result; uncertain write outcome is resolved by replay/reconciliation |

The foundation exposes `BusinessErrorCode` for the new domains while preserving
Bloglist's existing site/page/routing error classes. HTTP mappings and complete
adapter failure contracts remain to be agreed before implementing those adapters.
Confirmation/decline errors must never be encoded as a successful zero-change
result while the UI claims the requested business decision occurred.

## Composition with loaders, public pages and admin views

- Home's Build loader selects published pages using the site's game-template
  configuration, combines their content/parameters with owned ready media and
  routing-derived links, and passes view models to GameCard.
- GameDetail renders the same Page. Both use typed parameter/alias rules and
  read-only published-page contracts, never Game storage or administrative drafts.
- BookingForm's browser client calls public session query and request command.
  It does not call a build loader or create a request while rendering HTML.
- The admin Calendar consumes the admin sessions projection; Detail/Table consume
  admin session/request projections. Game content opens the ordinary Page editor.
  Scheduling actions include explicit recurrence scope and cancel/replace commands
  alongside participation confirm/decline; exact new ports remain to be agreed.
- After a successful decision, refresh related query bindings. Confirmation
  changes held/confirmed totals without increasing total occupied places;
  decline increases available places by the full released quantity.
- Menus, columns and action definitions are proposed admin configuration. Server
  endpoints independently enforce actor/site/object permissions.

The existing section operation IDs such as `games.sessions.list` are presentation
registry keys, not an instruction that `games` must own participation persistence.
Map them explicitly to the new capability ports; finalize IDs together with the
section schema. The same use case may serve an endpoint and loader without
sharing transport DTOs or private admin projections with public pages.

## Open decisions and implementation scope

These details do not prevent reviewing the boundaries, but block implementation
of the specific affected operations until their contracts are agreed:

- Remote admin authentication/permissions and trusted actor context for operations
  outside the accepted initial five. Their local-operator context and access ports
  are implemented under ADR 0005.
- Contact validation and normalization, per-request quantity ceiling if any, and
  whether individual group-member names are ever needed. Contact fields and
  variable positive quantity themselves are already confirmed.
- Booking cutoff, confirmation after session start, session cancellation/change
  effects on existing requests and capacity-reduction rules. Weekly recurrence,
  explicit edit scopes and occurrence cancel/replace are accepted under ADR 0009;
  exact contracts, generation limits and DST gap/overlap handling remain open.
  Do not invent automatic release of pending holds or silent attendee transfers.
- Notifications and their delivery channels, cancellation/rescheduling, retention
  and any future visitor status/retrieval authorization.
- URL retirement with no replacement, redirect/rebind preconditions for occupied
  targets and affected child routes, plus any new global-mark/version semantics.
- Exact API error/status/DTO shapes, pagination/byte limits and request-rate policy.
- Final admin-section schema; its current document remains a proposal.

The owner subsequently authorized the initial five local application operations
and full site/page repositories under ADR 0005. Other administrative workflows,
public HTTP delivery, payment, clusters, a full scheduler and event-report
implementation remain outside that scope. Agree affected open policies before
implementing those additional use cases/adapters.

### Implemented compatibility and consistency choices

- Bloglist site/page/routing source was copied locally, with no sibling imports.
  Nullable cluster values/reference shapes are retained; no cluster lookup port,
  module or cluster operation is required by this foundation.
- Existing Bloglist page create/update signatures remain intact. An optional
  `IPageRendering` field and separate `IConfigurePageRendering` port extend Page.
  URL rebinding preserves identity; versioned behavior commits use a new wrapper/
  port without altering the original URL repository contract.
- Publication Ready means verified domain metadata, not active hosting. A single
  activation port owns the future compare-and-switch pointer. Render plans carry
  their page/template snapshot rather than an ephemeral process-only parser object.
- The media model validates default profile coverage, actual dimensions, no
  upscaling and completed-version immutability. Cropped/additional density profiles
  need an explicit model extension before use. No image bytes have been processed.
  Storage writes distinguish private originals from derivatives explicitly; the
  public URL contract is separate from the opaque binary-storage reference.
- `ParticipationPolicy` returns detached session/request next states. Database
  atomicity, idempotent replay, persistent audit and concurrent-write behavior are
  obligations of the typed store port; they are not implemented/tested by a DB.
- Operation receipts distinguish request/confirm/decline results at the type
  boundary. Public projections contain no contact fields. A request table row
  shows the contact person and group quantity, not an invented individual roster.
- The source contains no application use cases, controllers, DI composition or
  external storage adapters. Unit tests cover domain behavior; architecture tests
  enforce inward dependencies and exclude custom modules from core imports.

Observable verification must cover the scenario's pages/chunks/URLs and media
contracts, plus group-capacity races, retry-after-acceptance, opposite concurrent
organizer decisions, cross-site privacy, required contact validation, calendar
interval boundaries and zero additional capacity use during confirmation.
