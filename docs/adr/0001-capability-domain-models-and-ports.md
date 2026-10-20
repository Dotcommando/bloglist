# Domain models and capability ports

Status: Accepted

The directory layout in this decision is superseded by
[ADR 0002](0002-layer-first-source-layout.md). Domain behavior and contracts
remain in effect.

## Context

The shared backend already owns MongoDB schemas for sites, clusters, pages,
routing and a global blogger/blog catalog. Business state and operations need
framework-independent contracts before persistence and application adapters are
connected.

## Decision

Keep the existing capability folders and MongoDB schema locations. Add sibling
`domain`, `app`, `ports` and `infra` directories inside those capabilities.
Business enums live exclusively in domain and are imported by persistence
schemas. Collection names, fields, defaults and indexes retain their existing
definitions.

The domain entities are `Site`, `Cluster`, `ClusterBlogPlacement`, `Page`, `Url`,
`Blogger` and `Blog`. `creators` remains a folder name. URL history is a readonly
state contract, not a separate entity or repository.

Each entity owns its state, exposes readonly getters and copies mutable dates,
arrays and snapshots. Constructors accept complete state for reconstruction;
methods validate a proposed state before applying a change. Identifiers use
entity-specific opaque strings. MongoDB identifier conversion remains the
responsibility of future persistence adapters.

Repositories and small lookup contracts belong to the consuming capability's
outbound ports. Lookup data does not import the provider's domain or schemas.
Site-owned clusters, pages and URLs keep their site identity. The blogger/blog
catalog remains global; cluster placements and URL history inherit site
ownership through their owning cluster or URL, as in the existing schemas.

Application operations have inbound contracts. At the owner's explicit request,
all 40 use-case files are empty: no classes, execution, orchestration or workflow
validation is introduced in this increment. DI files contain symbols only.

The routing repository contract owns an atomic address change: compare the
expected previous URL, append its previous state to history, create the new PAGE
URL and convert the old URL into a REDIRECT together. A stale expected state or
any failed write must leave no partial result.

## Consequences

Domain invariants can be tested without NestJS or MongoDB. Application workflows,
authorization, cross-site reference validation, hierarchy cycle detection,
repository uniqueness and transaction guarantees remain to be implemented when
use cases and adapters are connected. No new REST endpoints are exposed.

See [domain contracts](../arch/domain-contracts.md) for operation and failure
semantics and the boundary between entity validation and future workflows.
