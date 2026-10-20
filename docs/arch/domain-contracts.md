# Domain and operation contracts

## Source layout

The shared backend uses top-level architectural layers, as recorded in
[ADR 0002](../adr/0002-layer-first-source-layout.md):

- Domain models: `src/domain/<capability>/`.
- Empty use-case files: `src/app/use-cases/<capability>/`.
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

There is one inbound `I<Action>` contract per empty use-case file. Each exposes
`execute` returning a Promise. Create inputs contain business fields, without
caller-assigned entity IDs or persistence timestamps. Optional update fields mean
unchanged when omitted; `null` clears a nullable field. Marks, site identity,
language and permanent URL fields cannot be edited through update inputs.

Get and path lookup operations return the entity or `null` when absent. List
operations return complete matching arrays; no silent limit or pagination is
introduced. Mutating entity operations return the saved entity. Removing a
cluster placement and reordering placements return `void`. URL history returns
an array of readonly `IUrlHistoryEntry` snapshots.

All application contracts are declarations only. Their future implementations
must reject failed preconditions rather than return partial success. Expected
failure categories are missing referenced entities, uniqueness conflicts,
invalid language/site/parent relationships, hierarchy cycles and stale writes.
No concrete application error taxonomy or REST error encoding is implemented
yet; those contracts require agreement before implementing the use cases.

Site and user identities must come from trusted, authorized administrative
context. A string in an input or repository signature is not proof of authority.
Future orchestration must validate site ownership before reads and writes,
including operations whose repository lookup accepts only an entity identifier.

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
as a substitute for the deliberately empty use cases.

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
bindings are introduced by this increment.
