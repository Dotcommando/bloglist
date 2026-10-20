# Domain and operation contracts

## Source layout

The shared backend uses top-level architectural layers, as recorded in
[ADR 0002](../adr/0002-layer-first-source-layout.md):

- Domain models: `src/domain/<capability>/`.
- Use-case files: `src/app/use-cases/<capability>/` (sites, routing, pages and all ten cluster operations implemented).
- Inbound and outbound contracts: `src/ports/<direction>/<capability>/`.
- MongoDB schemas: `src/adapters/outbound/persistence/mongodb/<capability>/`.
- Capability DI tokens: `src/infra/<capability>/`.

The five capabilities retain their existing names and responsibilities.

## State and entity operations

Each entity exports an `I<Entity>State` containing all persisted fields, with
`_id` mapped to an entity-specific string identifier. Constructors require the
complete state, including lifecycle timestamps; future creation use cases supply
defaults matching the schemas. Optional stored values are explicit `null`.
Constructor input, getter dates, language arrays and `toState()` snapshots do
not share mutable state with an entity.

Entity methods return `void` and validate before committing the proposed state.
An invalid domain state raises `RangeError` without changing the entity. Invalid
URL syntax may raise the structured URL parser's `TypeError` before mutation.
Entities validate required identifiers, marks, enums, timestamps and their local
invariants. They do not perform repository or lookup calls.

- `Site` preserves its mark, normalizes primary hostnames (including IDN) and
  language codes, rejects duplicate languages and preserves the enabled default
  language. Adding an already enabled language fails. Removing the default
  language fails; removing another absent language is a no-op.
- `Cluster` preserves mark, site and language, supports an optional parent and
  rejects self-parenting. `changePrimaryQuery` covers the existing persisted
  search query alongside the requested editorial operations.
- `ClusterBlogPlacement` preserves cluster and blog identities. Finite fractional
  positions remain supported, with independent notes and visibility.
- `Page` preserves mark, site and language. `publish(at)` accepts an explicit UTC
  instant, preserves the original publication instant, and can republish an
  archived page. Publication changes no URL and does not change robots settings.
- `Url` preserves its identity, mark, site, parent, segment, path and initial
  publication instant. PAGE and REDIRECT states are mutually consistent;
  `redirectTo(target, status)` accepts only 301 or 308 and rejects self-redirects.
- `Blogger` and `Blog` preserve marks. A blog always has a blogger identity;
  changing its handle does not change its external identity. HTTP(S) channel URLs
  are normalized with the URL parser; blank external IDs become `null`.
  `updateStats(followers, checkedAt)` changes both latest values together and
  rejects negative or non-finite counts and invalid instants.

All dates represent instants, independent of the process time zone. Entity
operations do not synthesize wall-clock times or manage persistence timestamps;
`createdAt` and `updatedAt` retain their existing persistence ownership.

## Inbound operations

There is one inbound `I<Action>` contract per use-case file. Each exposes
`execute` returning a Promise. Create inputs contain business fields, without
caller-assigned entity IDs or persistence timestamps. Optional update fields mean
unchanged when omitted; `null` clears a nullable field. Marks, site identity,
language and permanent URL fields cannot be edited through update inputs.

Get and path lookup operations return the entity or `null` when absent. List
operations return complete matching arrays; no silent limit or pagination is
introduced. Mutating entity operations return the saved entity. Removing a
cluster placement and reordering placements return `void`. URL history returns
an array of readonly `IUrlHistoryEntry` snapshots.

The five site, four routing, seven page and ten cluster operations are implemented
as described below. Other application
contracts remain declarations only. Implementations must reject failed
preconditions rather than return partial success. Expected
failure categories are missing referenced entities, uniqueness conflicts,
invalid language/site/parent relationships, hierarchy cycles and stale writes.
The agreed site, routing, page and cluster errors are described below. Other application error taxonomies
and REST error encoding require agreement before implementation.

Site and user identities must come from trusted, authorized administrative
context. A string in an input or repository signature is not proof of authority.
Site operations require a trusted platform administrative caller; no new public
endpoint or authentication policy is introduced here. Future site-owned
orchestration must validate site ownership before reads and writes,
including operations whose repository lookup accepts only an entity identifier.

### Implemented site operations

The existing inbound inputs and results are unchanged. All five operations use
`ISiteRepository`; creation additionally uses `ISiteCreationValues` for a new
opaque identity and an explicit current instant. The system adapter generates
UUIDs and UTC instants; tests supply deterministic values.

- Create constructs and validates an ACTIVE site, normalizing its hostname and
  language codes through the domain entity. Its initial `createdAt` and
  `updatedAt` use the same instant. It checks the mark and normalized primary
  domain for uniqueness before saving.
- Update loads the requested site and modifies a detached copy. It adds languages,
  changes the default, then removes languages, permitting replacement of the old
  default in one operation. Invalid intermediate domain states fail. Omitted
  fields remain unchanged. A changed normalized hostname must not belong to
  another site. Mark, identity, status and timestamps cannot be edited by this
  operation.
- Archive loads the requested site, archives a detached copy and saves it.
  An already archived site remains archived. No related content is deleted or
  published, and no publication output is switched by this operation.
- Get returns the requested site or `null`; list returns all repository results,
  including archived sites, without filtering or truncation.
- Mutations return the repository's saved entity. Update and archive leave the
  loaded entity unchanged even if validation, uniqueness checks or saving fails.
  Their persistence timestamps remain adapter-owned.

Agreed failures:

| Condition | Outcome |
| --- | --- |
| Missing site for update/archive | `SiteNotFoundError`, including `siteId` |
| Existing mark on create, or primary domain owned by another site | `SiteConflictError` |
| Invalid domain state or hostname syntax | Existing domain `RangeError` / parser `TypeError` |
| Repository read or save failure | Original error propagated; no partial success returned |

Pre-save uniqueness checks do not replace atomic uniqueness enforcement. The
supplied repository must enforce case-insensitive mark and normalized-domain
uniqueness during save, including concurrent requests, and translate technical
conflicts into `SiteConflictError`. The current contract has no version argument;
no new stale-write guarantee is claimed for site updates. Atomic save semantics,
durability, identifier mapping and persistence timestamps belong to the supplied
adapter. No persistence implementation or production binding is added here.

`SitesModule.register({ repository, imports? })` binds the five inbound tokens to
their use cases. The repository is a Nest provider using `SITE_REPOSITORY`;
optional imports supply its dependencies. Invalid provider tokens fail during
registration. `AppModule.registerSites(options)` imports and re-exports the
configured sites module. Plain `AppModule` remains usable by the existing
bootstrap without a repository. Callers enable sites by supplying a repository
to `AppModule.registerSites`; no fallback storage is selected. See
[ADR 0003](../adr/0003-site-use-cases-and-composition.md).

### Implemented routing operations

The four routing use cases use `IUrlRepository`. Assignment and address changes
share `PageUrlPreparationService`, which constructs a PAGE URL and validates
page/parent ownership and mark/path availability through the existing ports.
`IUrlCreationValues` supplies an opaque identity and one UTC instant for the
new URL's `firstPublishedAt`, `createdAt` and `updatedAt`; the system adapter
generates UUIDs and current instants. The input path is preserved exactly and
checked by the existing domain invariants; no new normalization or derivation
from parent/segment is introduced.

- Assign initial URL requires a page from `siteId`, an existing parent from the
  same site when supplied, an unused global case-insensitive mark, an unused
  `(siteId, path)` and no current PAGE URL for the page. It returns the saved URL.
- Change URL has the same page, parent, mark and path checks and requires the
  current PAGE URL to reference that page and site. Reusing any existing path,
  including the previous path, is a conflict. A detached copy validates the
  redirect to the new identity with status 301 or 308. One `changePageUrl` call
  receives the complete expected previous state, new PAGE URL, redirect status
  and change instant. The loaded previous entity remains unchanged.
- Change returns the submitted new URL only after the atomic persistence call
  succeeds. That existing port returns `void`, so this operation does not perform
  a separate save or a fallible read after commit. Its returned timestamps are
  the submitted initial instants; unlike assignment, there is no returned
  persistence timestamp refresh.
- Find by path passes the exact `siteId` and path to the repository, returns PAGE
  or REDIRECT behavior unchanged, and returns `null` when absent. It rejects an
  out-of-site repository result rather than exposing it.
- Get history now requires both `siteId` and `urlId`, as approved by the owner.
  It loads the URL, verifies `siteId`, then reads the complete history and returns
  detached snapshots, including copied dates. An existing URL without history
  returns an empty array. A missing URL fails before reading history.

Only site membership is checked in this increment; no users, roles or new
authentication mechanism are added. The supplied `siteId` must be the intended
site context. This equality check is not proof of a caller's authorization.
URL hierarchy remains independent of page and cluster hierarchy; a parent need
not serve a PAGE. No page publication status is inferred from the lookup port,
which only exposes page and site identities. Static publication, cache
invalidation and REST endpoints are not introduced by these operations.

Agreed failures:

| Condition | Outcome |
| --- | --- |
| Missing page, parent URL, current URL or history-owning URL | `RoutingNotFoundError` |
| Occupied mark/path, or initial assignment to a page with a current URL | `RoutingConflictError` |
| Page, parent, current URL or queried URL belongs to another site | `RoutingScopeError` |
| Invalid domain values, unsupported redirect status or inconsistent current PAGE state | `RangeError` / existing parser `TypeError` |
| Repository or lookup failure, including stale-write rejection | Original error propagated without retry or partial success |

The business error classes live in domain so persistence adapters can translate
technical conflicts without importing application implementations. Prechecks
are advisory: supplied persistence must atomically enforce mark, site/path and
single-current-PAGE uniqueness even for concurrent assignment. Atomic address
changes must implement all obligations below, including stale-state detection,
append-only history and rollback. Use-case tests verify validation, snapshots,
the single atomic call and failure propagation; they do not claim a database
transaction implementation. No concrete routing persistence or page lookup
adapter is added.

`RoutingModule.register({ repository, pageLookup, imports? })` requires providers
under `URL_REPOSITORY` and `PAGE_LOOKUP_PORT`; optional imported modules may
export their dependencies. It exports the four inbound operation tokens.
`AppModule.registerRouting(options)` enables routing alone;
`AppModule.register({ sites, routing })` composes both capabilities and re-exports
their inbound providers. `registerSites` remains supported. Plain `AppModule`
still boots without persistence. See
[ADR 0004](../adr/0004-routing-use-cases-and-site-scoping.md).

### Implemented page operations

All seven page operations are implemented and exported. Single-page operations
require `siteId` alongside `pageId`, applying the agreed site-scoping rule to
archive and get as well as update, assignment and publication. Creation and list
already accept siteId. Only site equality is checked; users and roles are not
modeled by these operations.

- Create constructs a DRAFT with a generated opaque identity and one UTC instant
  for initial creation/update timestamps. Defaults match the schema: STATIC,
  no cluster, nullable heading/SEO fields, empty Markdown, robotsIndex=true and
  publishedAt=null. Optional business values are preserved. Domain normalization
  trims the title and normalizes the language before reference checks.
  The site must exist and enable the language. A supplied cluster must exist,
  belong to the same site and use the same language. Mark uniqueness is global
  and case-insensitive, including across sites.
- Update verifies ownership, edits a detached page using explicit domain
  operations and saves it. Omitted fields remain unchanged; `null` clears a
  nullable heading/SEO field. Updating one SEO field preserves the other.
  Empty Markdown and robotsIndex=false are valid supplied values. Mark, site,
  language, cluster and lifecycle values cannot be changed through this input.
- Assignment verifies page ownership and changes its cluster on a detached
  page. A non-null cluster must pass the same site/language checks as creation.
  Passing `null` removes the assignment without requiring external site/cluster
  lookups. Other page state remains unchanged.
- Publish verifies page ownership, calls `Page.publish` with an explicit current
  UTC instant, then saves the detached page. First publication sets publishedAt;
  repeated publication and republication of archived pages preserve the original
  instant. An archived page never previously published receives the current
  instant. Content, robotsIndex and persistence timestamps remain unchanged by
  the domain transition. This operation persists page publication state;
  routing continues to own URL assignment, and output publication is a separate
  workflow.
- Archive checks page ownership, archives a detached page and saves it. An
  already archived page remains archived. Content, cluster, robotsIndex and the
  original publication/creation/update instants are preserved by the domain
  transition. A never-published page retains publishedAt=null. Related URLs and
  publication outputs continue to belong to their separate workflows.
- Get reads a page by identity and verifies siteId before returning it. It
  returns `null` when absent and `PageScopeError` for another site's page.
  Draft, published and archived pages can all be returned in this administrative
  operation.
- List calls `findBySite` with the explicit siteId and only supported filter
  fields: clusterId, language, type and status. Omitted values remain omitted;
  clusterId=null is preserved. Filters are copied and extra fields are ignored,
  so a filter cannot override siteId. The complete matching array is returned
  without truncation or an implicit publication filter. An empty match returns
  `[]`. Any out-of-site result causes `PageScopeError` for the entire operation,
  rather than returning partial data. These read operations do not save pages.

All page mutations return the repository's saved entity. Failed validation,
lookup or saving cannot mutate the page instance returned by the repository.
Persistence still owns final creation/update timestamps and durable writes.

Agreed failures:

| Condition | Outcome |
| --- | --- |
| Missing required mutation target, site or cluster | `PageNotFoundError` |
| Missing page on get, or no matching pages on list | `null` or `[]`, respectively |
| Occupied global mark | `PageConflictError` |
| Page, site lookup result, cluster or list result belongs to another site | `PageScopeError` |
| Disabled page language, cluster-language mismatch or invalid domain values/instants | `RangeError` / existing domain parser errors |
| Repository or lookup failure | Original error propagated without retry |

The errors live in domain, allowing persistence adapters to translate conflicts
without importing application implementations. Mark prechecks do not replace
atomic uniqueness during concurrent saves. The repository contract adds no
version check or new stale-write guarantee.

Two shared application services have separate responsibilities:
`PageScopeService` loads and detaches the owned page for update, assignment,
publication and archive; `PageRelationshipsService` validates site, enabled language and
optional cluster references for creation and non-null assignment.
`IPageLifecycleValues` supplies identities/instants for creation and instants for
publication; its system adapter generates UUIDs and UTC instants.

`PagesModule.register({ repository, siteLookup, clusterLookup, imports? })`
requires providers under `PAGE_REPOSITORY`, `SITE_LOOKUP_PORT` and
`CLUSTER_LOOKUP_PORT`. It exports all seven page inbound tokens.
`AppModule.registerPages(options)` enables pages alone, while
`AppModule.register({ sites, routing, pages })` supports joint composition.
Concrete persistence and lookup adapters remain caller-supplied. See
[ADR 0005](../adr/0005-first-four-page-use-cases.md) and
[ADR 0006](../adr/0006-remaining-page-use-cases.md).

### Implemented cluster operations

The implemented operations are create, update, get, list, archive, move, add blog,
update placement, remove blog and reorder blogs. Get/update/archive/move and all placement mutations
require `siteId` alongside `clusterId`, as approved by the owner. The owning
cluster determines placement site scope. Cluster creation uses the site lookup
and `IClusterCreationValues` for an opaque identity and a UTC instant. The system
adapter generates UUIDs and current instants.

- Create builds an ACTIVE cluster with one instant for initial creation/update
  timestamps. Parent, Markdown description, industry, geography and primaryQuery
  default to null. Domain operations trim the name and optional metadata and
  normalize the language, while preserving Markdown source. The site must
  exist and enable the normalized language. A supplied parent must exist and
  belong to the same site and language. Self-parenting fails domain validation.
  The global case-insensitive mark must be unused. Creation saves only the new
  identity and does not move existing clusters.
- Update checks that the target exists and belongs to siteId, then edits a
  detached copy through domain methods. Omitted fields remain unchanged; null
  clears nullable fields. Empty nullable text is retained. Mark, identity,
  site, language, parent, status and persistence timestamps cannot be changed
  by this input. The repository's loaded instance remains unchanged on both
  success and failure.
- Get checks site ownership before returning an ACTIVE or ARCHIVED cluster;
  an absent cluster returns null.
- List calls `findBySite` with explicit siteId and a copy of supported filters:
  language, status and parentClusterId. Null parent filters are preserved and
  extra fields cannot override site scope. The complete matching array,
  including archived clusters when matched, is returned without truncation or
  an implicit status filter. No matches return `[]`. An out-of-site result
  rejects the whole operation rather than returning partial data.
- Archive loads and detaches the owned cluster, changes status to ARCHIVED and
  saves it. Repeated archiving preserves that state. Content, parent, language,
  timestamps, page references and blog placements are not altered by this
  transition; no cascading changes are introduced.
- Add blog checks the owning cluster's site before accessing the catalog or
  placement repository. It requires the global blog to exist and the
  `(clusterId, blogId)` pair to be unused. A new placement gets an opaque identity
  and one UTC instant for initial timestamps, notesMd=null and visible=true
  unless supplied. Finite fractional and negative positions remain supported.
  Empty Markdown notes and visible=false are explicit supplied values.
- Update placement checks the cluster's site before loading the exact pair and
  editing a detached copy. It can change only position, notes and visibility;
  omission means unchanged and null clears notes. Placement identity, pair and
  timestamps remain unchanged by domain operations. A missing placement fails.
- Remove blog checks the cluster's site and the existing exact placement, then
  removes only that pair and returns void. A missing placement, including
  repeated removal, raises ClusterNotFoundError. It does not delete the global
  blog. Update/removal do not require the blog to still exist in the catalog.
- Move loads the owned source as a detached entity and captures its expected
  original state. It validates the proposed parent through `Cluster.moveTo`,
  then walks the entire prospective ancestor chain, requiring every ancestor
  to exist and use the same site/language. A visited-identity set rejects both
  descendant moves and pre-existing ancestor cycles. Passing null moves the
  cluster to root. Status, metadata and timestamps are unchanged by application
  validation. One `IClusterRepository.move` call receives the expected source
  state and new parent identity and returns the actual saved entity.
- Reorder checks the cluster site first, then snapshots the supplied partial
  position list. Domain policy rejects blank blog identities, duplicate blog
  identities and non-finite/nonnumeric positions. Tied, fractional and negative
  finite positions are allowed. An empty list succeeds after the site check
  without placement reads or writes. For a nonempty list, every requested pair
  must already belong to the cluster, including hidden placements. After all
  checks, one `updatePositions` call updates the requested pairs and returns
  void. Unlisted pairs, notes, visibility and placement identities are preserved;
  catalog blog existence is not required.

Saving mutations return the repository's saved entity; read operations do not save.
Only site equality and the declared relationships are checked; users and roles
are not introduced. Hierarchy changes use move rather than ordinary update.

Agreed failures:

| Condition | Outcome |
| --- | --- |
| Missing required site/ancestor/cluster, blog on addition, or requested existing placement | `ClusterNotFoundError` |
| Occupied global mark, existing cluster/blog pair or stale expected move state | `ClusterConflictError` |
| Target, site lookup result, parent or list result belongs to another site | `ClusterScopeError` |
| Disabled language, ancestor-language mismatch, hierarchy cycle, duplicate reorder ID, invalid position/domain values or mismatched placement pair | `RangeError` / existing domain validation errors |
| Missing cluster on get, or no matches on list | `null` or `[]`, respectively |
| Repository or lookup failure | Original error propagated without retry |

The business errors live in domain. Persistence must enforce global
case-insensitive mark uniqueness atomically during save and translate technical
conflicts into `ClusterConflictError`. Prechecks do not replace this guarantee.
Ordinary saves introduce no version check; final persistence timestamps,
identifier mapping and durable writes remain adapter obligations. Existing
cluster saves must preserve the current persisted parent rather than overwrite
it from an old edit/archive snapshot. Parent changes must use the move port.
Placement persistence must enforce pair uniqueness atomically and translate
duplicates into ClusterConflictError. Removal must target only the requested
pair and report absence, including concurrent disappearance, as
ClusterNotFoundError. Read-before-write checks do not introduce versioned
updates or stronger concurrent-update guarantees than the current ports.

The new move port must atomically verify the expected source state, re-read the
current prospective ancestor chain, enforce same-site/same-language acyclic
relationships and change the parent, or fail without writes. It must serialize
competing hierarchy changes. Snapshot reads followed by independent writes to
different clusters are insufficient: the adapter needs a shared hierarchy
concurrency guard or equivalent serialization to prevent concurrent opposite
moves from creating a cycle. A stale expected source raises ClusterConflictError;
other current-state failures use the categories above. The use case does not
retry or issue a separate save.

Position persistence must atomically recheck all requested memberships and
update all supplied positions together, or fail without any position writes.
A pair removed after application prechecks raises ClusterNotFoundError for the
whole batch. Use-case tests verify these single-call boundaries, snapshots and
failure propagation; concrete hierarchy serialization and database rollback
remain adapter obligations, not implemented persistence behavior.

`ClusterScopeService` supports archive and all placement mutations by loading
and detaching a cluster after checking its site. `ClusterBlogPlacementScopeService`
supports update/removal by checking that scope first, validating the returned
pair and detaching the placement. `IClusterBlogCreationValues` supplies new
placement identities and UTC instants through its system adapter.

`ClustersModule.register({ repository, siteLookup, placementRepository, blogLookup, imports? })`
now requires all four providers under `CLUSTER_REPOSITORY`, the cluster-owned
`SITE_LOOKUP_PORT`, `CLUSTER_BLOG_REPOSITORY` and `BLOG_LOOKUP_PORT`. Existing
registration calls must supply the two new dependencies; no fallback is bound.
It exports all ten cluster inbound tokens.
`AppModule.registerClusters(options)` enables it alone; the combined
`AppModule.register` accepts `clusters` alongside sites, pages and routing.
Persistence and site lookup implementations remain caller-supplied.
See [ADR 0007](../adr/0007-selected-cluster-use-cases.md) and
[ADR 0008](../adr/0008-cluster-archive-and-blog-placements.md) and
[ADR 0009](../adr/0009-cluster-moves-and-blog-reordering.md).

## Outbound obligations for future adapters

Repository signatures follow the requested contracts. Mark lookups must preserve
the existing case-insensitive uniqueness semantics. `findBySite` must scope every
filter to its site. Placement/history site ownership must be resolved through the
owning entity. Global blogger/blog reads require their own authorization policy.

Lookup ports expose only the required data:

| Consumer | Lookup | Required data |
| --- | --- | --- |
| clusters | Site | site ID and enabled languages |
| clusters | Blog | existence |
| pages | Site | site ID and enabled languages |
| pages | Cluster | cluster ID, site ID and language |
| routing | Page | page ID and site ID |

Creation and parent/cluster assignment must validate these relationships before
saving. Cluster moves additionally require walking the ancestor chain to reject
cycles, same-site and same-language parents. Blog creation must check blogger
existence and mark, URL and optional platform/external-ID uniqueness; reassigning
a blog must validate the new owner. These checks are not moved into domain models
as a substitute for application orchestration; creator use cases remain empty.

`IChangePageUrlPersistence` carries the expected previous URL state, new PAGE
URL, redirect status and change instant. A future adapter must atomically:

1. Verify that the previous PAGE URL still matches its expected state and that
   the new URL belongs to the same site/page, has a distinct identity and does
   not occupy an existing site/path or violate unique marks.
2. Append the previous behavior to `url_history`, using `changedAt` for the
   history record's creation instant.
3. Create the new PAGE URL and redirect the old URL to it.

Concurrent/stale changes or any failure must roll back all writes. Database
sessions and identifiers stay inside adapters. The existing unique current-PAGE
index may require an appropriate internal write order; the externally observable
result must remain atomic. These are adapter obligations, not claims of existing
transaction behavior.

Persistence adapters for all seven entities, the atomic routing operation and
all five lookup adapters remain future work. No database changes or adapter
bindings for persistence are introduced by these use cases.
