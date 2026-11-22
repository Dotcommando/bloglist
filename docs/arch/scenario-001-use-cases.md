# Scenario 001: Application use cases

> Historical implementation scope. This document records an early development
> boundary, including optional business capabilities. For current operation use
> the [developer guide](../guide/en/README.md) and maintained capability contracts.
> It does not authorize installing business code in the clean CMS distribution.

Date: 2026-10-24

Status: Application contract specification. Fifty regular operations and the
console-only administrator creation operation have
application implementations, local Nest composition and real adapters;
all currently declared operations are implemented. See
[local application contracts](local-application.md) for invocation and verification.
Source interfaces describe the existing code, subject to the explicit retirement
and adaptation requirements of [ADR 0009](../adr/0009-game-pages-and-recurring-sessions.md).
Do not implement the superseded game-content contracts. The first-five scope and local
access contracts below were agreed on 2026-10-24. Other proposed additions are
explicitly identified and require contract agreement before their implementation.

References: [scenario 001](../../scenarios/001-psychologist-games-site.md),
[domains and ports](scenario-001-domains-and-ports.md),
[admin section composition](admin-sections-proposal.md),
[ADR 0004](../adr/0004-scenario-001-capabilities-and-participation-boundary.md), and
[ADR 0005](../adr/0005-initial-local-application-boundary.md).

## Scope and application responsibilities

The four retired game-content contracts have been removed. Twenty core, five
media/scheduling, five administration-user, five authentication and five session
catalog/cancellation operations, five participation/game-change operations and
five site/archive/URL-behavior operations are implemented, with
the additional script-only creation boundary. Administration follows
[ADR 0011](../adr/0011-administration-users-and-script-only-creation.md) and
[its contracts](administration-users.md).
[Authentication contracts](admin-authentication.md) and
[ADR 0012](../adr/0012-admin-authentication-and-persistent-sessions.md) define
the five REST authentication operations. The media/scheduling batch follows
[ADR 0010](../adr/0010-local-media-and-rolling-session-schedules.md) and
[the implemented media/scheduling contracts](media-and-session-scheduling.md).
The session catalog/cancellation batch follows
[ADR 0013](../adr/0013-session-catalog-and-cancellation.md) and
[its contracts](session-catalog.md). Participation requests/decisions and ChangeSessionPage follow
[ADR 0014](../adr/0014-participation-and-session-game-change.md) and
[their contracts](participation.md). Core operations belong to `sites`,
`pages`, `routing`, `publication` and `media`; game content is ordinary Page data.
Scheduling/participation is an optional site module. Core use cases must not import its
repositories, models or concrete implementations. Registered read bindings
connect custom public data to the rendering workflow.

Each inbound operation has one `<Action>UseCase` implementing its existing port
under `src/app/use-cases/<capability>/<action>.use-case.ts`. All expose the port's
`execute` method; `IListSites.execute()` has no input. Controllers, worker handlers
and CLI adapters call inbound interfaces. Domain objects own invariants; use
cases own sequencing, reference checks, persistence outcomes and failure recovery.
No NestJS decorators, MongoDB/S3 clients or UI components belong in these classes.

The tables below link exact input/result interfaces and name outbound dependencies.
Detailed flows define the required behavior beyond those types. An outbound
method call alone is not a completed workflow. Small query use cases may be thin,
but still enforce scope, supported inputs, result integrity and failure semantics.
Create an application service only for a demonstrated shared responsibility.

## First five use cases: agreed initial scope

The owner selected one use case at a time with test-first application/adapter
implementation and AppModule composition. The current workflow is maintained in
[feature lifecycle](../cms-development/feature-lifecycle.md), with execution rules in
[testing policy](../cms-development/testing-policy.md). The owner accepted all three
initial-boundary decisions below on 2026-10-24. This section records implementation
scope and behavior, not implementation status or a progress-tracking plan.

| Order | Existing case | Observable behavior |
| --- | --- | --- |
| 1 | S1: CreateSite | Create an ACTIVE site with validated domain/languages and persisted identity; reject duplicate mark/domain |
| 2 | S4: GetSite | Read the requested Site under trusted administrative access; absent returns null |
| 3 | S6: ResolveSite | Normalize a trusted hostname and resolve its site without a default-site fallback |
| 4 | P1: CreatePage | Create a language-valid DRAFT Page in an existing owned site, without a cluster dependency |
| 5 | P6: GetPage | Read the owned editable Page or null; reject foreign-site results |

Together these exercise sites and pages, domain lookup, application composition,
Mongoose mapping, durable uniqueness and capability-to-capability lookup. They do
not yet publish or serve a website. Routing follows as a separate behavior after
this foundation; its transactional URL-change contract need not be rushed into
the first implementation. No games, booking, media, loaders or admin frontend
are required for this scope.

### Accepted decisions for unattended implementation

1. **Administrative entry and access (C1).** Invoke
   inbound tokens through a local Nest application context/AppModule, with an
   explicitly trusted local-operator context and no administrative HTTP listeners.
   No new CLI command language or identity-provider subsystem is required. Protect
   administrative operations through capability-owned access ports, with denial
   tests; the local operator is granted platform administration only by this
   explicit composition context, never by a caller-supplied siteId or actorId.
   The supporting contracts are: `ISiteAccessPort` exposes
   `assertCanCreateSite(): Promise<void>` and
   `assertCanReadSite(siteId: string): Promise<void>`; `IPageAccessPort` exposes
   `assertCanCreatePage(siteId: string): Promise<void>` and
   `assertCanReadPage(siteId: string): Promise<void>`. Identity is supplied by the
   trusted invocation context, not new fields in the five inherited inputs.
   REST and its authentication mechanism are deferred. A network entry point must
   not inherit the local-operator privilege. Neither an open admin endpoint nor
   a test-only authorizer in production is acceptable.
2. **Archived sites (C2).** ResolveSite returns null for archived
   records, while GetSite remains available to an authorized administrator.
   Permit administrative creation/read of draft pages in an archived site; this
   does not reactivate it or publish anything. This choice preserves the current
   site-reference contract; no status/eligibility field is needed in
   `ISiteLookupPort` for this scope. Enforcement of archival by
   public delivery/publication remains outside these five operations.
3. **Broad repository contracts.** Implement the complete existing
   `ISiteRepository` and `IPageRepository` contracts with test-first adapter work,
   without adding their other inbound workflows. This includes their simple
   query methods; no unimplemented stubs or optional cluster-provider dependency.
   Keep their approved interfaces; no repository splitting is required for this
   scope. Unit-test each newly implemented adapter behavior before implementation.

### Baseline semantics for this scope

Existing inputs/results remain unchanged. Site marks remain globally case-insensitive
and normalized site hostnames remain unique. Page marks are case-insensitively
unique within each site under [ADR 0050](../adr/0050-site-scoped-page-keys.md).
Enforce uniqueness with explicit migrations/indexes, including concurrent writes;
prechecks alone are not sufficient. Normalize hostnames using the same policy as
Site, retaining the current language-code rules. Unknown domain returns null;
malformed hostname fails validation. No domain aliases, automatic www redirects
or trust of arbitrary forwarded headers is introduced.

CreatePage uses the P1 defaults below. Omitted/null clusterId is supported;
non-null clusterId fails explicit unsupported validation until an owning extension
is configured. Validate the page's language against the referenced site's enabled
languages. Cross-capability site lookup uses an explicit inbound site operation,
not the sites repository or its MongoDB collection. No publication/template/URL
assignment happens during page creation.

Generate opaque UUID identifiers and UTC instants in concrete values adapters;
application tests supply deterministic values. Required references fail when
absent; optional Get operations return null. Preserve the failure vocabulary below.
Create commands have no operation key in their inherited contracts: a repeated
mark/domain is a conflict, not an invented idempotent success. Propagate uncertain
writes without a blind save retry; reconciliation must use trusted identity/mark
lookups without claiming that these five interfaces already offer a public
operation-status endpoint. Never claim a transaction across sites/pages for
these independent operations.

The first scheduled integration run covers real AppModule resolution, persistence
across application contexts, duplicate mark/domain rejection, hostname resolution,
valid/invalid language, null versus foreign-site reads, and isolation between two
synthetic sites. Exercise concurrent duplicate creation to verify database indexes.
Use an isolated Docker MongoDB environment with explicit versioned migrations;
tests must not touch sibling-project or production databases. The fifth-use-case
execution boundary was an initial arrangement, superseded by testing-policy.md.

## Second five: editable content and working URL lifecycle

The owner accepted their supporting contract changes and required an optional
subtree move on 2026-10-24. These operations are implemented with fake-port unit
coverage, real adapters and local composition. The initial integration cadence
is superseded by [testing policy](../cms-development/testing-policy.md). See the accepted decision in
[ADR 0006](../adr/0006-working-routing-and-page-editing.md).

| Order | Existing case | Reason to implement it next |
| --- | --- | --- |
| 6 | P2: UpdatePage | Finish editing the drafts already created/read, reusing the implemented page repository |
| 7 | R1: AssignInitialPageUrl | Attach an independent stable URL to an owned page without coupling content identity to its path |
| 8 | R3: FindUrlByPath | Inspect exact working routing state and prove site-scoped lookup |
| 9 | R2: ChangePageUrl | Move a page address atomically, retain the old URL as a redirect and record its previous behavior |
| 10 | R4: GetUrlHistory | Inspect the retained address's changes and verify the completed routing lifecycle |

These form an observable cycle: edit a draft, assign its URL, find it, move to a
new URL, then inspect the old redirect and history. They implement working-state
management, not public HTML delivery or release activation. The existing
ISiteRepository/IPageRepository need no additional methods for these operations.
Publication should follow after its template registry, read-binding execution,
snapshot and activation contracts in C3 are agreed; introducing it now would hide
those unresolved responsibilities behind an apparently simple Publish call.

### Accepted supporting contracts

- Add `assertCanUpdatePage(siteId: string): Promise<void>` to IPageAccessPort.
  Define IRoutingAccessPort with these three exact methods:
  `assertCanAssignPageUrl(siteId: string): Promise<void>`,
  `assertCanChangePageUrl(siteId: string): Promise<void>` and
  `assertCanReadRouting(siteId: string): Promise<void>`. Keep the accepted
  local operator boundary; no new administrative REST/authentication is required.
- IPageLookupPort now exposes
  `findPage(siteId: string, pageId: string): Promise<IPageReference | null>`.
  Its current signature accepts pageId alone, whereas the existing IGetPage
  inbound operation requires siteId as well. Passing trusted scope explicitly
  lets the routing adapter call IGetPage without another capability's repository,
  an unscoped private-content query or mutable ambient site state. This is an
  outbound contract change accepted by the owner and implemented in the scoped adapter.
- Implement the complete existing IUrlRepository, including transactional
  changePageUrl and history, with explicit URL/history collections and migrations.
  Under the inherited contract, the persistence adapter assigns history-row IDs
  and commits history/new URL/old redirect together; sessions stay inside it.
  The versioned behavior store for R5/R6 is a separate responsibility and is not
  needed by this batch. Complete repository scope was accepted by the owner.

### Accepted path and subtree behavior

Preserve Bloglist's supplied site-relative path/segment semantics and parent
ownership checks. Do not introduce automatic trailing-slash rewriting. By default,
moveSubtree is false and existing descendant paths/parent references remain intact.
With moveSubtree=true, the entire subtree moves atomically: new paths replace the
old root prefix, new parent IDs/internal redirect targets are remapped, and every
old URL remains as a redirect with history. Page IDs remain stable; fresh URL IDs
and generated descendant marks distinguish new addresses. Reject invalid hierarchy,
paths outside the old prefix, conflicting destinations and concurrent membership
changes without partial writes. The future admin UI must expose both choices,
defaulting to parent-only. The inherited initial URL timestamp is populated
at assignment; it is not proof that public HTML was published. Archival/public
release behavior remains a separate workflow.

Keep UpdatePage's existing omitted-versus-null semantics and inherited lack of an
expected-version field; do not claim optimistic edit concurrency. Retain 301/308
redirect choices, reject occupied paths and competing current URLs, and require
same-site page/parent/target identity checks. An uncertain changePageUrl outcome
must not trigger a blind retry with a fresh URL ID. Reconcile the prepared old/new
identities through trusted reads and expose an unresolved dependency outcome if
necessary; a new idempotency contract would need separate agreement.

The next integration boundary should prove a complete assign/find/move/history
cycle, uniqueness races and rollback with an injected fault inside the actual
transaction. Compare stale previous URL state during commit; a failed/stale move
must leave no new URL, partial redirect or orphan history. Verify matching paths
on different sites remain isolated. Local MongoDB already runs a replica set;
the routing-specific integration coverage exercises those guarantees.

## Third five: rendering and publication

Implemented under the owner's simplified model in
[ADR 0007](../adr/0007-simple-page-publication-and-releases.md).
There is one editable draft and three retained published page versions, with no
reviewer, approval workflow or sourceRevision input/registry.

| Order | Operation | Observable behavior |
| --- | --- | --- |
| 11 | ConfigurePageRendering | Validate the registered template, typed parameters and loader graph, then save |
| 12 | PreviewPage | Return an actual compiled private browser preview of current working content |
| 13 | PublishPage | Publish the current draft directly and atomically retain the latest three versions |
| 14 | PublishSiteRelease | Build current published content and atomically activate the complete release |
| 15 | ResolvePublishedPath | Resolve an exact path against one active immutable release |

See [rendering contracts and invocation](rendering-and-publication.md) for source
configuration, parameterized chunks, loaders, storage, failure behavior and the
recommended next five. Publishing a page stores content; publishing a site release
makes built output active. Archival adds no new restriction to these operations.
Routing validates redirects when saved; a destination not yet published does not
require a separate publication approval or prevent preserving its redirect path.

Public HTTP delivery and execution of a resolved Request plan are implemented by
the fourth five below, alongside local lists and restoration into the draft.

## Common execution contract

1. Establish trusted actor/site or worker context and enforce the operation's
   access policy before exposing private data or returning an idempotent result.
   Domain-mapped public site identity does not come from a submitted form field.
   Legacy core ports lack `actorId`; preserve their signatures and resolve the
   authorization integration described in C1 below. Never interpret omission as
   permission to execute an administrative operation publicly.
2. Validate supported inputs independently of persistence. Use current domain
   validators, typed values and explicit fields; no unchecked query/update objects.
3. Read owned references through the appropriate capability ports. Verify returned
   identifiers and `siteId`, including when a repository signature accepts only
   an entity ID. Reject inconsistent results without returning partial data.
4. For mutations, work on detached snapshots/entities. A failed validation or save
   must not mutate an object retained by a fake repository or another consumer.
5. Obtain new IDs, versions and UTC instants through the owning values ports.
   Domain/application code does not create wall-clock values, random IDs or SDK
   sessions implicitly. Preserve inherited timestamp ownership: Site/Page updates
   leave persistence-owned `updatedAt` to the repository where its port requires it.
   Scheduling receives lifecycle values through its own explicit ports.
6. Await the acknowledged write/commit, then return the contract's entity or
   projection. A lost acknowledgement is an uncertain outcome, not proof that
   nothing was written. Follow the operation's replay/reconciliation rules.

Optional update fields mean unchanged; explicit null clears a nullable field.
No silently truncated lists, hidden retries, automatic hold expiry or implicit
notification/payment workflow is introduced. Read errors are distinct from empty
results. No create/update use case silently publishes a release.

### Failure vocabulary

New code uses the existing `BusinessErrorCode` categories: Validation, NotFound,
Scope, Forbidden, Conflict, StaleWrite, InvalidTransition, CapacityUnavailable,
NotBookable and IdempotencyConflict. Preserve existing Page/Routing error types
when implementing their inherited contracts. Domain RangeError/TypeError behavior
does not become an HTTP response format here. Agree wire mappings in the adapter
task, without leaking private record existence or provider exceptions.

An optional entity read returns null when the owned entity is absent. A command
requiring an absent reference fails NotFound. A foreign/inconsistent result fails
Scope. Lists return no mixed-site partial success. Technical dependency errors
propagate through a documented adapter error contract rather than becoming null.

## S. Sites: platform identity and configuration

Initiator: authorized platform administration, except S6, which serves the
trusted document/API routing boundary. Ports live in `ports/inbound/sites/`.

| ID | Implementation / inbound contract | Result | Outbound dependencies |
| --- | --- | --- | --- |
| S1 | `CreateSiteUseCase` / [ICreateSite](../../src/ports/inbound/sites/create-site.port.ts) | Site | `ISiteRepository`, `ISiteCreationValues` |
| S2 | `UpdateSiteUseCase` / [IUpdateSite](../../src/ports/inbound/sites/update-site.port.ts) | Saved Site | `ISiteRepository`, `ISiteUpdateStorePort`, editing access |
| S3 | `ArchiveSiteUseCase` / [IArchiveSite](../../src/ports/inbound/sites/archive-site.port.ts) | Saved Site | `ISiteRepository`, `ISiteUpdateStorePort`, editing access |
| S4 | `GetSiteUseCase` / [IGetSite](../../src/ports/inbound/sites/get-site.port.ts) | Site or null | `ISiteRepository` |
| S5 | `ListSitesUseCase` / [IListSites](../../src/ports/inbound/sites/list-sites.port.ts) | Complete Site array | `ISiteRepository` |
| S6 | `ResolveSiteUseCase` / [IResolveSite](../../src/ports/inbound/sites/resolve-site.port.ts) | Matched Site or null | `ISiteRepository` |

### S1. Create site

Use mark, name, primaryDomain, languages and defaultLanguage from the existing
input. Allocate site identity and one creation instant, construct an ACTIVE Site
using its normalization/invariants, then check mark and normalized domain
availability. Save once and return the saved Site. Existing mark/domain produces
Conflict; invalid host/languages/default fails validation. Repository uniqueness
remains authoritative during concurrent creation; prechecks alone are insufficient.

### S2. Update site

Load the required Site, detach it and apply only supplied fields. Add languages,
then change the default, then remove languages so a valid default replacement
does not fail due to update order. Check changed normalized-domain ownership,
save and return the saved Site. Never change siteId/mark or silently migrate
page languages/URL domains. Validation/reference/conflict failures leave the
loaded object unchanged. Removal is forbidden while any page uses the language,
including drafts and archived pages; the transaction guards concurrent creation
under [ADR 0015](../adr/0015-site-lifecycle-and-retained-url-behavior.md).

### S3. Archive site

Load, detach, call `Site.archive()` and commit against the captured snapshot.
Already archived remains archived.
This operation changes stored site state only: it does not delete content,
modify URL history, revoke files or switch a publication. Immediate public
delivery continues to follow ResolveSite, which excludes archived sites.

### S4-S5. Read site / list sites

S4 returns the requested owned Site or null. S5 returns the full repository list,
including archived records, under platform authorization. Neither filters out
records silently nor introduces paging into the inherited interfaces. Invalid
returned identity or malformed entities are failures, not another site's result.

### S6. Resolve site

Apply the same hostname policy used by Site, through a shared pure rule if needed;
do not construct a fake Site just to call its private normalization method. Read
`findByPrimaryDomain`, verify the returned host, and return Site/null. The adapter
owns trusted proxy/header interpretation. Unknown host is null; malformed input
fails validation. No guessed default site, caller-supplied site substitution or
hardcoded owner's domain. An archived Site returns null under the accepted initial
policy; it remains retrievable through authorized GetSite.

## P. Pages: editorial state and render configuration

Initiator: authorized site editor/admin. Read adapters may support protected
preview/editing; these are not public content endpoints by default.

| ID | Implementation / inbound contract | Result | Outbound dependencies |
| --- | --- | --- | --- |
| P1 | `CreatePageUseCase` / [ICreatePage](../../src/ports/inbound/pages/create-page.port.ts) | Draft Page | `IPageRepository`, `ISiteLookupPort`, `IPageLifecycleValues` |
| P2 | `UpdatePageUseCase` / [IUpdatePage](../../src/ports/inbound/pages/update-page.port.ts) | Saved Page | `IPageRepository` |
| P3 | `ConfigurePageRenderingUseCase` / [IConfigurePageRendering](../../src/ports/inbound/pages/configure-page-rendering.port.ts) | Saved Page | `IPageRepository`; configuration validation |
| P4 | `PublishPageUseCase` / [IPublishPage](../../src/ports/inbound/pages/publish-page.port.ts) | Directly published Page, three retained versions | Page publication store, registry, access and lifecycle values |
| P5 | `ArchivePageUseCase` / [IArchivePage](../../src/ports/inbound/pages/archive-page.port.ts) | Archived Page | `IPageRepository`, `IPageArchivalPort`, editing access |
| P6 | `GetPageUseCase` / [IGetPage](../../src/ports/inbound/pages/get-page.port.ts) | Page or null | `IPageRepository` |
| P7 | `ListPagesUseCase` / [IListPages](../../src/ports/inbound/pages/list-pages.port.ts) | Complete Page array | `IPageRepository` |

### P1. Create page

Validate site existence/identity and enabled language through `ISiteLookupPort`.
Check case-insensitive mark availability within the trusted site. Allocate pageId and one instant; initialize DRAFT,
clusterId null, type STATIC, nullable heading/SEO fields null, contentMd empty,
robotsIndex true and publishedAt null when their corresponding optional inputs
are omitted. Explicit supplied values override those defaults. Construct Page,
save and return its saved value. A non-null clusterId needs a configured cluster
extension; this cluster-free foundation rejects unsupported assignment explicitly
instead of fabricating a lookup or accepting unchecked foreign membership.

### P2. Update page

Require an owned Page, detach it and apply supplied title, h1, SEO, contentMd,
type and robotsIndex using domain methods. Preserve omitted values; null clears
the corresponding nullable value. Save once. Do not change immutable mark,
site/language, cluster membership, URL or rendering through this input. There is
no expected-version field in this inherited port; do not claim a new lost-update
guarantee without an agreed contract extension. Editing published content creates
the next draft while retained published versions remain unchanged (ADR 0007).

### P3. Configure page rendering

Require site/actor permission and an owned Page. On a detached entity call
`configureRendering` with the supplied typed configuration and save only after
validation. Enforce distinct/nonreserved loader aliases, valid phases, acyclic
dependencies, no request loader on Static delivery and no Build-to-Request
dependency. This is declarative configuration: no loader execution or bundle build
occurs here. Existence/parameter-schema validation against the template/loader
registry is implemented here as well. Rendering configuration never executes a
loader or builds a bundle. Editing a published page's rendering creates its next
draft while preserving the published versions.

### P4-P5. Direct publish / archive

Load and detach an owned Page. P4 calls `publish` with the explicit current UTC
instant and atomically retains its three newest published versions through
IPagePublicationPort, preserving the original first-publication instant. No
approval is involved. P5 atomically compares the captured page and archives it. Return the saved Page.
These operations do not change
robots settings, assign/remove a URL or activate/remove public artifacts. P5 is
not the complete page-retirement workflow: a future release/removal operation
must validate every URL disposition before publication (C4).

### P6-P7. Read page / list pages

P6 returns the owned Page or null. P7 copies supported filters (clusterId, language,
type and status as defined by `IPageFilter`), calls the site-scoped repository and
verifies every result belongs to the site. Return the complete matching array. No hidden paging,
cross-site partial arrays or implicit publication filtering. Private editing reads
must never become the public game/content loader merely by reusing this result.

## R. Routing: independent URLs and behavior history

Initiator: authorized site routing/editorial administration. These operations
modify/read working routing state. Public resolution uses PUB3's active snapshot.

| ID | Implementation / inbound contract | Result | Outbound dependencies |
| --- | --- | --- | --- |
| R1 | `AssignInitialPageUrlUseCase` / [IAssignInitialPageUrl](../../src/ports/inbound/routing/assign-initial-page-url.port.ts) | New PAGE Url | `IUrlRepository`, `IPageLookupPort`, `IUrlCreationValues` |
| R2 | `ChangePageUrlUseCase` / [IChangePageUrl](../../src/ports/inbound/routing/change-page-url.port.ts) | New PAGE Url | Same as R1; atomic `changePageUrl` |
| R3 | `FindUrlByPathUseCase` / [IFindUrlByPath](../../src/ports/inbound/routing/find-url-by-path.port.ts) | Url or null | `IUrlRepository` |
| R4 | `GetUrlHistoryUseCase` / [IGetUrlHistory](../../src/ports/inbound/routing/get-url-history.port.ts) | Complete owned history | `IUrlRepository` |
| R5 | `RebindUrlToPageUseCase` / [IRebindUrlToPage](../../src/ports/inbound/routing/rebind-url-to-page.port.ts) | Retained Url, new PAGE target | `IUrlBehaviorStorePort`, `IUrlRepository`, `IPageLookupPort`; behavior values (C4) |
| R6 | `RedirectUrlUseCase` / [IRedirectUrl](../../src/ports/inbound/routing/redirect-url.port.ts) | Retained Url, REDIRECT behavior | `IUrlBehaviorStorePort`, `IUrlRepository`; behavior values (C4) |

### R1. Assign initial page URL

Require an existing same-site page, same-site parent URL when supplied, unused
global mark, unused `(siteId, path)` and no current PAGE URL for that page.
Create a PAGE Url with explicit identity/time, null redirect fields and the
supplied parent/segment/path. Save once and return the saved Url. Preserve the
existing exact-path contract; do not derive or normalize paths differently based
on hierarchy without agreeing that change. Readiness of draft pages for public
delivery is determined by publication, not by assigning their working URL.

### R2. Change page URL

Perform R1's reference/availability checks and require the current PAGE URL to
reference the page/site. Reusing an occupied path, including the old path, is a
conflict. Construct the new PAGE Url; validate the old URL becoming a redirect
on a detached copy. Call `changePageUrl` once with expected previous state,
newUrl, redirectStatus and changedAt. The port atomically creates the new URL,
records history and redirects the old URL. Return newUrl after acknowledgement;
no fallible post-commit reread or two independent saves. Stale prior state or a
concurrent uniqueness conflict fails without partial changes.

The optional moveSubtree flag defaults to false. When true, collect all descendants
through explicit ports, validate ownership/hierarchy and page references, allocate
fresh URL identities/marks, and apply the domain relocation policy. Submit the
captured root/descendant states and prepared replacements to one atomic commit.
The adapter guards all routing writes in the site before verifying membership and
state; new children or stale nodes cause conflict. Historical redirects and their
targets are relocated coherently as well. No whole-subtree UI is implemented yet.

### R3-R4. Exact lookup / URL history

R3 uses the supplied site's exact path lookup and returns an owned Url/null.
R4 first verifies URL existence and site ownership, then reads that URL's history.
An absent required URL fails NotFound. History rows must reference the requested
urlId; reject inconsistent arrays. Neither operation changes behavior or timestamps.

### R5. Rebind a retained URL to another page

Load the versioned URL and require its site/version to match the input. Require
the replacement page to exist in that site and have no different current PAGE
URL; preserving the one-current-PAGE-URL rule is mandatory. Detach the URL and
call `bindToPage`. Prepare the previous behavior history, next version and explicit
instant, then make one `commitBehaviorChange` call. Preserve URL identity, mark,
path, parent and firstPublishedAt. Return the prepared Url only after success.
Domain-local rebinding does not itself persist history or check repository-wide
uniqueness. The adapter must enforce commit-time conflicts. It is not an implicit
archive/delete of the previously associated page.

### R6. Turn a retained URL into a redirect

Load/verify site and expected version, load the target and traverse its redirect
chain through explicit routing lookups. Reject missing/foreign targets, self-
redirects and existing/new cycles. On a detached URL call `redirectTo`, prepare
history/version/time and commit once through `commitBehaviorChange`. Return the
prepared Url after acknowledgement. The store must reject a graph change made
invalid by a concurrent target update; prechecking the chain is not sufficient.
The real adapter revalidates graph relationships under its transactional site
write guard; history/version/behavior commit together. See [the implemented
contracts](site-editing-and-url-behavior.md).

## PUB. Publication: preview, build and active release resolution

Initiators: site editor/publisher for PUB1-PUB2; trusted public document adapter
for PUB3. Publication remains independent of games and bookings.

| ID | Implementation / inbound contract | Result | Outbound dependencies |
| --- | --- | --- | --- |
| PUB1 | `PreviewPageUseCase` / [IPreviewPage](../../src/ports/inbound/publication/preview-page.port.ts) | Protected rendered document | Source/composition ports; read-binding and preview context contracts (C3) |
| PUB2 | `PublishSiteReleaseUseCase` / [IPublishSiteRelease](../../src/ports/inbound/publication/publish-site-release.port.ts) | Acknowledged active release | Source, composition, frontend build, publication store, activation and values ports; read bindings (C3) |
| PUB3 | `ResolvePublishedPathUseCase` / [IResolvePublishedPath](../../src/ports/inbound/publication/resolve-published-path.port.ts) | StoredDocument / RequestPlan / Redirect / NotFound | `IReleaseActivationPort`, `IPublicationStorePort` |

### PUB1. Protected page preview

Authorize the trusted local editor. Read the selected page's current working
content and trusted template/chunk/frontend sources. Validate parameters and phase
dependencies, execute read-only loaders and compile real HTML/CSS/JS. For Request
pages accept explicit typed requestValues. Return IPreviewResult with the compiled
HTML and an unguessable loopback browser URL, not a public publication URL.
The preview is no-store/noindex and closes with the local application context.

### PUB2. Publish a site release

Authorize the local publisher and reject a stale expectedActiveReleaseId. Read
current published page versions, working routing and trusted file sources once
for this invocation; do not introduce a persisted source revision or use current
drafts as fallback. Prepare route dependencies and validate all registered CSS.
Execute Build bindings and compose Static documents. Freeze Build values and
prebuilt CSS/JS plans privately for Request routes, which have no public final HTML.

Build actual minified HTML/CSS and minified/obfuscated browser JS. Preserve saved
redirect destinations, including a target page that has not yet been published.
Verify artifacts, hashes and private plan references. Stage the complete immutable
release before atomically comparing/switching the active pointer with an activation
receipt. Previous release output remains available on failure and after success.
A lost activation acknowledgement is reconciled from its receipt, never by
blind retry, deleting Ready output or switching back to an older pointer.

### PUB3. Resolve a published path

Read the trusted site's active pointer once, then that exact immutable release.
No active release or unmatched path returns NotFound. Missing/corrupt/foreign
active release data fails explicitly. Return a StoredDocument, RequestPlan or
Redirect with the selected release ID. A saved redirect destination may have no
currently published document; return its path without reading working drafts.
This operation neither executes a Request plan nor builds frontend assets.

### Fourth five: public delivery, lists and restoration

The owner accepted the new contracts and public HTTP under
[ADR 0008](../adr/0008-public-delivery-and-page-restoration.md).
See [exact inputs, results and invocation](public-delivery-and-page-restore-contracts.md).

| Order | Operation | Observable behavior |
| --- | --- | --- |
| 16 | RenderPublishedPage | Execute the pinned activated Request plan with validated public query data, frozen Build values and prebuilt resources |
| 17 | GetPublishedArtifact | Read only verified declared public files of an activated owned release; retain legacy asset delivery |
| 18 | ListSites | Return every managed site, including archived sites, through trusted local list/read permissions |
| 19 | ListPages | Return the complete owned page list with existing filters and read permission |
| 20 | RestorePageVersion | Atomically replace the full draft from retained position 1/2/3 without publishing or changing URLs/history |

PUB3 selects delivery once. RenderPublishedPage never reselects a newer release,
executes Build loaders, compiles resources or reads editable pages. Public loaders
are read-only and receive declared values and trusted site/page context, never
cookies, account credentials or local-administrator privileges. Required failures
produce unavailable responses; missing frozen data is a consistency failure.

The separate HTTP composition exposes GET/HEAD documents and assets, 301/308,
404, ETags, cache policy and CSP style hashes. It rejects unknown hosts, ignores
forwarded headers and reserves API/admin/asset namespaces. Administrative lists
and restoration remain local through AppModule. Personalized/account content is
not part of this public-only request boundary.

Restoration preserves identity, language, routing, cluster, creation and first
publication instants. It restores text, SEO, type, robots and all render settings,
sets DRAFT and guards both captured records in one transaction. A moved/pruned
version or changed draft fails without replacing content. No extra drafts,
approval or revision-management subsystem is introduced.

## M. Media: implemented upload, processing and reads

UploadAsset, ProcessAsset and GetAsset now follow
[the current contracts](media-and-session-scheduling.md) and
[ADR 0010](../adr/0010-local-media-and-rolling-session-schedules.md).
This supersedes the earlier dispatch/retry proposal. Storage is explicitly local,
processing is awaited once, and originals remain private. Failure/replay,
proportional WebP, attachment and access contracts are specified there.

## G. Game content: ordinary pages; separate workflows retired

Under [ADR 0009](../adr/0009-game-pages-and-recurring-sessions.md), retire
CreateGame, UpdateGame, GetPublicGame and ListPublicGames (former G1-G4).
Their source ports/domain scaffolding have been removed; no separate game use case exists.

Create/edit/configure/preview/publish the ordinary Page using existing operations
and the site's GameDetail template. Typed parameters contain card summary,
expandable text and card/hero media references; Page owns title, full body and
SEO. Do not add a duplicate Game record, gameId or hardcoded game PageType.

Registered Build loaders select the relevant published pages from publication
input, prepare owned ready public media and route links, and feed the shared
GameCard chunk. Detail pages render that same Page. Public loaders must not read
administrative drafts or require the release being built to be active already.
New published-page/media read contracts still require agreement; removing G1-G4
does not make administrative GetPage/ListPages safe for public use.

## Scheduling responsibilities accepted under ADR 0009

The optional participation module owns series, occurrences and requests.
CreateSessionSeries and ChangeSessionSchedule are implemented under ADR 0010.
Other operations below remain separate future application workflows:

| Action | Required behavior |
| --- | --- |
| Schedule a meeting | Create an owned page-linked one-off session or recurring series with local time, IANA zone, duration and capacity |
| Change recurrence | Explicit scope: this occurrence, this and following, or the whole series |
| Cancel a session | Persist one occurrence's cancellation without cancelling other dates or recreating it on regeneration |
| Replace a session's game | Override that occurrence's owned pageId without editing the page or silently changing other occurrences |
| Request participation | Reserve the entire group on one concrete stable sessionId, pending organizer decision |
| Organizer decision | Confirm held places or decline/release them under existing atomicity/idempotency rules |

One page can have several series. Persist occurrence exceptions and stable
session identities across regeneration/rescheduling. Evaluate recurrence in its
configured IANA zone and save concrete UTC instants. Keep these operations out
of page editing and loaders. Existing-booking retention, historical protection,
rolling generation and DST policy are resolved by ADR 0010.

## B. Participation: sessions, held places and organizer decisions

The B1-B8 table below records the declared application workflows. B1, B2, B4 and
B5 are implemented alongside CancelSession under ADR 0013. B3 and B6-B8, together
with ChangeSessionPage, are implemented under ADR 0014.
They use page/session identities; the separate Game model is removed.
Series creation and scoped editing are implemented separately under ADR 0010.

Actors: organizer for B1/B4-B8; public visitor for B2-B3. All public site values
come from trusted domain resolution, and every result is checked for site/object
integrity. Private contact data never enters public loaders or static artifacts.

| ID | Implementation / inbound contract | Result | Outbound dependencies |
| --- | --- | --- | --- |
| B1 | `CreateSessionUseCase` / `ICreateSession` | New Session | Store, page eligibility lookup, access and values ports |
| B2 | `ListBookableSessionsUseCase` / `IListBookableSessions` | Paged public sessions | Store and page eligibility lookup ports; eligibility policy (C7) |
| B3 | `RequestParticipationUseCase` / `IRequestParticipation` | Original Pending receipt | Store, page eligibility lookup and values ports; input identity/eligibility policy (C7) |
| B4 | `ListAdminSessionsUseCase` / `IListAdminSessions` | Paged calendar projections | Store and access ports |
| B5 | `GetAdminSessionUseCase` / `IGetAdminSession` | Admin session or null | Store and access ports |
| B6 | `ListSessionRequestsUseCase` / `IListSessionRequests` | Paged request/contact rows | Store and access ports |
| B7 | `ConfirmParticipationUseCase` / `IConfirmParticipation` | Confirmed decision | Store, access and values ports; input identity policy (C7) |
| B8 | `DeclineParticipationUseCase` / `IDeclineParticipation` | Declined decision | Same as B7 |

Session create/find/list/cancel now use ISessionStorePort, separate from the
implemented request/decision IParticipationStorePort. Session administrative
access uses ISessionCatalogAccessPort; public eligibility uses
IPublicSessionPagePort against one active published release. See the current
session-catalog contracts above; the older B2 details below are superseded by
the owner's explicit filters, including history, cancellations and full meetings.
The accepted booking and game-change behavior is specified in [participation contracts](participation.md).

### B1. Create scheduled session

Require CreateSession permission. Verify the associated Page exists in the same site and
meets the scheduling eligibility policy. Allocate session identity/version;
construct Session using the explicit UTC start/end, IANA timeZone and positive
safe-integer capacity, with zero held/confirmed places. Call createSession and
return the acknowledged domain state. No individual visitor booking, implicit
public report Page or free-time calendar is created. Scheduling future/start-time
and simultaneous-session rules are C7; do not infer them from server local time.

### B2. List bookable sessions

Validate the selected owned Page and eligibility. Validate rangeStart/rangeEnd,
positive explicit page limit and cursor through the configured query policy.
Call the reviewed page-scoped session query for the selected pageId.
Check the result page matches site/page/range and the approved visibility/
eligibility contract. Return only IBookableSession fields and nextCursor.
Full/cancelled/past-session presentation and booking cutoff are C7. A failed API
does not return an empty successful calendar. Changing game selection in the UI
uses a new query and cannot make a previous response current again.

### B3. Request places for a group

1. Validate trusted site, page/session relationships, nonempty operation key,
   positive safe-integer places and required name/phone/email. Apply the agreed
   normalization policy before computing the canonical input identity. There
   is no per-person roster, payment or automatic confirmation in this contract.
2. Construct a Request operation identity scoped by site/key with actorId null.
   Read its stored receipt before checking current availability. Matching input
   replays the original Pending receipt, even if the organizer has since decided
   the request or the session is now full. A reused key with different semantic
   input fails IdempotencyConflict. Validate receipt identity/result consistency.
3. For a new operation, load the owned session and its published-page eligibility.
   Verify sessionId/pageId/site relationships, the live booking policy and that
   the entire quantity fits. A browser's previous count is never a reservation.
4. Allocate request identity/reference/version, next session version and one UTC
   requestedAt. Construct a Pending BookingRequest, then call
   `ParticipationPolicy.reserve` on detached snapshots to compute both next states.
5. Construct the minimal acceptance receipt from those allocated values, with
   no contact data, plus its scoped input identity. Call commitRequest once with
   expected session version, new request/session and the operation receipt.
6. Return the receipt only after durable acknowledgement. No second save, detached
   notification promise or reread is required to manufacture a successful result.

Concurrent allocation losers cannot partially hold a group. On a known same-key
duplicate conflict, read the winner's receipt and return it only if its canonical
input matches. On stale-session capacity state without a matching receipt, return
StaleWrite/CapacityUnavailable according to the contract; do not silently retry
against a new session state. On an uncertain commit, lookup/reconcile that same
operation identity. Receipt absence is not proof that an in-flight commit failed;
preserve the original key for safe caller retry and do not allocate a new hold.

The receipt is an acceptance snapshot, not public authorization to read contacts
or a current booking-status endpoint. Replay checks precede mutable eligibility
so a previously accepted operation is not denied just because its own hold filled
the session. Actor/site/rate-access policy still applies to every call.

### B4-B5. Organizer calendar and session details

Require ReadSessions permission. B4 validates the optional game filter, explicit
page parameters and the half-open UTC interval; query intersections rather than
only sessions whose start lies inside it. Validate returned occupancy arithmetic,
intervals and selected game membership. B5 returns an owned matching projection
or null. Neither changes capacity/state or exposes contact fields unnecessarily.

Display uses each session's configured IANA zone. Calendar paging must either
load all pages for the visible interval or visibly indicate partial/paged data;
never label the first page as a complete month. DTOs lack siteId in projections,
so backing queries need a trusted scope guarantee under C8, not an assertion
that a use case can verify a missing field at runtime.

### B6. View session requests / participants

Require ReadRequests permission; load the required session and verify scope.
Validate state filter/cursor/limit, query listRequests and verify sessionId on
every row. Return a page of contact-person records, group quantity, state and
version. Pending and Confirmed rows are distinct; do not label pending applicants
as confirmed participants or treat a group contact as all named group members.
Phone/email require this permission independently of menu/column visibility.

### B7-B8. Confirm or decline a pending request

1. Require Confirm or Decline permission for the actor/site before receipt reads.
   Validate requestId, expectedRequestVersion and operation key, and derive the
   canonical identity of that specific command (C7).
2. Lookup its Confirm/Decline receipt under the site/actor/operation/key. A matching
   receipt replays the original typed decision before checking the now-stale
   expected version. Different semantic input fails IdempotencyConflict.
3. Load the required owned request and its session. Check site/page/session
   relationships, expected request version, Pending state and the applicable
   post-start/cancellation decision policy. Terminal-to-opposite and fresh-key
   repeated terminal decisions fail rather than silently changing counters.
4. Allocate next session/request versions and decidedAt. Call
   `ParticipationPolicy.decide` with Confirmed or Declined plus actor audit values.
   Confirmation moves q held places to confirmed; decline releases q held places.
5. Prepare the correctly typed result/receipt and call commitDecision once with
   both expected versions, next snapshots and that receipt. Occupancy, request
   state, decision audit and idempotency outcome commit together or not at all.
6. Return the acknowledged decision. Same-key races/uncertain commits follow B3's
   receipt reconciliation rule. A stale independent session/request update is an
   explicit conflict; any later retry must reauthorize, reload and revalidate.

After success the admin runtime refreshes session, calendar and request bindings;
these UI refreshes do not constitute the transaction. Sending notifications and
automatically expiring holds are not steps of B7/B8 until separately agreed.

## Required contract decisions before affected implementations

These are source/behavior decisions, not a reason to block unrelated use cases.
Resolved items below must not be reopened for the already implemented batch.
Proposed names describe the missing responsibility; agree exact shapes before code.

| ID | Affected cases | Current gap and required decision |
| --- | --- | --- |
| C1 | Administrative core, scheduling, M1/M3 | Resolved for all 25 implemented operations with explicit local authority and capability-owned access ports. Public GET/HEAD uses separate composition. Administration users and script-only creation are the next capability under ADR 0011; network authentication remains separate. |
| C2 | S2/S3/S6, P1 | Resolved for the first five: ResolveSite excludes archived sites, authorized GetSite and draft-page creation/read remain available, and non-null cluster assignment is rejected without its extension. ADR 0015 forbids removal of any language used by pages, guarded against concurrent creation. ArchiveSite preserves releases/files; ResolveSite excludes archived sites. |
| C3 | P3, PUB1-PUB3, request rendering | Resolved under ADRs 0007/0008: direct publication, three retained versions, typed loaders, compiled preview, private plans, activation receipts and public GET/HEAD. Request rendering reuses frozen Build data/prebuilt resources and receives public declared values only. Account/private request contexts remain future contracts. |
| C4 | R5/R6, page retirement | Resolved under ADR 0015: IUrlBehaviorValuesPort supplies history IDs, versions and time; the complete behavior store serializes routing writes and validates target graphs at commit. Full page retirement/child disposition remains a separate unmodeled workflow. |
| C5 | M1/M2 | Resolved under ADR 0010: bounded actual inspection, immutable filesystem writes, explicit single-attempt processing and reconciliation of unknown completion. No dispatch, automatic retry or Failed retry transition; unreferenced objects are retained for explicit future cleanup. Ready versions remain immutable. |
| C6 | Published-page loaders, PUB2, B1-B3 | Game source contracts are removed. Owned-page scheduling, recurrence, scoped edits and rolling generation are implemented under ADR 0010. Cancel/replace/booking application operations are implemented under ADRs 0013/0014; public card/detail loader projections remain separate integration contracts. |
| C7 | B1-B3/B7/B8 | Resolved by ADR 0014: required normalized contacts, whole-group capacity, cutoff at start, historical decisions, cancelled-session decline only, persistent HMAC semantic identity and atomic retained receipts with explicit replay/conflict/reconciliation. No expiry or notifications. |
| C8 | New paged reads | Agree maximum counts/ranges, cursor/sort semantics, encoded-size limits and projection scope proofs; record units/values in transport-limits.md when introduced. Public/admin session projections currently omit siteId, so explicitly guarantee scope in the query contract or agree a scoped internal wrapper before application checks rely on it. |

For C3, a read-binding executor must invoke only a validated, trusted registry of
read operations with typed parameters and captured context. It is not an arbitrary
service locator, internal HTTP proxy or dynamic execution of markup/database code.
For C5, recovery after binary/metadata failure must not assume an object store and
MongoDB share a transaction. For C7, semantic command identity includes expected
version where relevant; intentionally changing that guard cannot reuse the same
key to mean a different command. Receipt retention/security remains explicit.

## Shared application services with real consumers

The following are justified candidates when implementation begins. They are
optional organization choices, not extra forwarding services for every use case:

- An owned-page loading/snapshot helper for P2-P6, preserving NotFound/Scope behavior.
- Routing preparation for R1/R2 and a verified redirect-graph helper for R6 and
  publication validation, using ports without cross-capability repository access.
- Published-page/media view-model preparation shared by card/detail loaders when needed.
- Read-binding dependency execution shared by PUB1/PUB2 and future request rendering,
  with phase-aware namespacing, stable memo keys, bounded execution and cancellation.
- Participation receipt replay/validation shared by B3/B7/B8; keep operation-specific
  authorization, sequencing and final commit responsibility in each use case.

Do not put entire workflows into a generic CmsService or add a forwarding-only
UseCase wrapper. Shared policy/DTO/error helpers name their actual role.

## Observable acceptance for the next code task

Every implemented use case must implement its existing inbound interface and
pass fake-port tests at the execute boundary. No live databases, notifications,
object stores or paid services are needed for these application tests.

| Area | Required observations |
| --- | --- |
| Reads | Absent versus dependency failure, foreign returned IDs/site, no partial mixed-site arrays, correct exact path/filter/range/paging behavior |
| Mutations | Validation before writes, one intended save/commit, saved result semantics, unchanged repository-owned objects on failure |
| Sites/pages | Duplicate marks/domains, valid language replacement order, no mandatory cluster provider, first publishedAt preserved, no accidental public release/URL side effects |
| Routing | Current URL uniqueness, stale expected state, preserved URL identity/history, missing/foreign target, self/long/cross-update cycles and no independent partial saves |
| Publication | Scope mismatch, include/loader failures, Build/Request isolation, no custom-module dependency in core, staging failure, stale switch and uncertain activation without deleting a potentially active release |
| Media | Actual-versus-declared metadata, private originals, all required profiles, small-source reuse, failed derivative/metadata write, duplicate worker delivery and no lost processing work |
| Game pages | Ordinary page publication, typed card/detail fields, owned ready public images, routing-derived links and no duplicate Game/draft fallback |
| Scheduling | Same-site page links, independent series and one-off sessions, explicit recurrence-edit scope, stable sessionId, persisted cancel/replace exceptions, no duplicate/resurrected occurrences and explicit handling of existing bookings |
| Booking | Entire group or nothing, missing contacts, no extra capacity on confirm, full release on decline, wrong game/site/session, same-key replay, changed-input conflict, stale versions and opposite organizer decisions |

Fake-port tests verify application sequencing and handling of simulated outcomes.
They do not prove MongoDB transaction rollback, storage durability or real races;
concrete adapters must pass later integration/contract tests. Shared core tests
must run without scheduling/participation providers. Keep architecture tests enforcing
domain/ports/app inward imports and optional custom modules.

Public card expansion, form prefilling, admin component rendering and notification
delivery are separate UI/integration responsibilities. No new application use
cases for generic dashboards, payment, arbitrary appointment slots, clusters or
completed-session reports are introduced by this specification.
