# ADR 0006: Working routing and page editing

Date: 2026-10-24

Status: Accepted on 2026-10-24. The owner accepted the supporting contracts and
required an optional subtree-move parameter, defaulting to a parent-only move.
The second five operations are implemented under this boundary.

## Context

CreateSite, GetSite, ResolveSite, CreatePage and GetPage now run through a local
Nest application context with Mongoose repositories. The next requested scope is
UpdatePage, AssignInitialPageUrl, FindUrlByPath, ChangePageUrl and GetUrlHistory.
It establishes editable working content and independently managed addresses,
before public publication/rendering.

IPageLookupPort currently accepts only pageId. The existing IGetPage inbound
operation also requires siteId, so the routing adapter cannot call it with explicit
trusted scope without a supporting contract change. New operations also require
their own access checks. Address changes must preserve history and single-current
PAGE uniqueness within one acknowledged transaction.

## Decision A: supporting contracts and composition

Keep the five inbound result types and existing fields. Extend ChangePageUrl input
with optional moveSubtree: boolean, default false. Keep the trusted local operator
and defer administrative REST/authentication under ADR 0005.

Change IPageLookupPort to this exact contract, retaining its existing reference
result shape:

```typescript
interface IPageLookupPort {
  findPage(siteId: string, pageId: string): Promise<IPageReference | null>;
}
```

Extend IPageAccessPort with:

```typescript
assertCanUpdatePage(siteId: string): Promise<void>;
```

Add this routing-owned outbound access contract:

```typescript
interface IRoutingAccessPort {
  assertCanAssignPageUrl(siteId: string): Promise<void>;
  assertCanChangePageUrl(siteId: string): Promise<void>;
  assertCanReadRouting(siteId: string): Promise<void>;
}
```

The read permission covers working path lookup and URL history. Page lookup calls
IGetPage and returns only pageId/siteId; no page repository or collection access
crosses capability ownership. Local access adapters use the explicit immutable
operator context and include denial tests. No new actor fields or mutable ambient
site selection are introduced.

Implement the complete IUrlRepository, including its queries, save, history and
atomic changePageUrl method, with Mongoose adapters and explicit versioned
URL/history collection validators and indexes. Enforce global case-insensitive
URL marks, site/path uniqueness and a single current PAGE URL per page. History
IDs and persistence versions needed internally stay inside the adapter; application
URL IDs and UTC instants use the existing IUrlCreationValues port. No separate
IUrlBehaviorStorePort implementation or rebind/redirect inbound workflow is added.

IUrlCreationValues additionally supplies nextUrlMark() for fresh descendant
addresses. IChangePageUrlPersistence carries optional moveSubtree and descendants,
each holding an expected previous URL and its prepared replacement. The adapter
verifies complete subtree membership/state before committing. The existing
single-parent calls remain valid; the result remains the new root Url.

## Decision B: retained paths and optional subtree relocation

Preserve explicitly supplied site-relative path and segment values under the
existing domain validation. Exact lookup distinguishes /game from /game/ and
does not automatically rewrite case or trailing slashes. Parent references must
belong to the same site; parent relationships do not recompute stored paths.

When /games/old/ moves to /games/new/, retain the old URL identity/path as a 301
or 308 redirect to the newly allocated URL, according to the required input.
A descendant such as /games/old/report/ keeps its existing path and parent
reference by default. With moveSubtree=true, collect the entire parent-linked
subtree, replace the old root path prefix in each descendant path and create new
addresses. Remap new parent IDs and internal redirect targets to the new addresses;
keep page IDs, segments and existing redirect statuses. Old descendant identities,
marks and paths remain as redirects to their replacements, with history. All old
redirects use the status supplied for the move. Generated marks keep new descendant
addresses distinct without renaming retained old URL identities.

Reject cyclic/foreign/disconnected hierarchy, descendants outside the old path
prefix, parents inside the moved subtree, duplicate or occupied destinations and
concurrent subtree membership/state changes. Any such failure leaves the whole
move unapplied. The future admin form must offer parent-only versus whole-subtree
movement, with parent-only selected by default. This iteration provides the typed
parameter; it does not build the Svelte admin UI.

Initial assignment may reference an owned draft page, including working content
of an archived site. The operation creates routing data, not a live public page.
The inherited firstPublishedAt value is set at URL assignment; it does not certify
a publication release. Updating published/archived working Page content does not
activate a release or change its editorial lifecycle state.

## Preserved failure and history semantics

Keep UpdatePage's existing omission/null behavior and lack of an expected-version
input. It edits a detached owned Page and returns the acknowledged saved entity;
it does not claim optimistic edit concurrency. Preserve existing page/routing
error classes, scope checks and duplicate conflicts.

A new URL has an empty history. A successful address change records each previous
URL behavior at changedAt, persists the replacements and makes each old URL a
redirect in one transaction. History reads require an owned URL and return its
complete history ordered by createdAt and history identity, oldest first.
No user-selected retention, pagination, deletion or audit-actor contract is added.

Check expected previous URL state during commit, enforce uniqueness at commit
and leave no partial changes on known failure. Do not silently retry a business
command against newly read state or allocate fresh identities after an uncertain
commit. Preserve prepared old/new identities for reconciliation. A new idempotency
key or optimistic-version field would require a separately agreed contract.

## Research evidence and verification boundary

An isolated diagnostic on local MongoDB 8.0.29 confirmed that a transaction can
remove the old document from a partial unique current-PAGE index and insert the
replacement PAGE document under the same site/page key before commit. The probe
database was generated for that run and removed afterwards. This establishes
technical feasibility, not implemented application or rollback correctness.

The implemented adapter serializes all routing writes for a site through a
transactionally updated routing_versions record. After obtaining that write
guard it checks captured state and complete subtree membership, preventing
phantom children or conflicting relationship changes from bypassing a subtree
move. Guard versions remain persistence details. URL/history/guard collections
are defined by migration 0003; a partial unique index applies current-page
uniqueness only to PAGE records. No implicit business-command retries are used.

Unit and integration coverage now exercise the accepted operations, including
subtree redirects, rollback, concurrency and uncertain commit acknowledgement.

Implement one use case at a time with failing application/adapter tests first and
AppModule wiring verified with fake overrides. After the fifth new operation,
run the accumulated integration suite including assignment/find/move/history,
two-site isolation, concurrent uniqueness conflicts, stale-state rejection and
an injected in-transaction failure proving rollback. Reject unsupported MongoDB
topologies for transactional routing rather than degrading to independent saves.

## Consequences

The reviewed input/output surface remains portable to Bloglist, with one explicit
outbound lookup change and explicit permission additions. Public publication,
page retirement and retained-URL rebinding stay outside this scope. Descendant
movement is explicit and atomic rather than an automatic consequence of every
parent address change.
