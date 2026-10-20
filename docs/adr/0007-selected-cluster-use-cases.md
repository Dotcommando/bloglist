# Selected cluster use cases

Status: Accepted

Archive and blog-placement operations extend this scope in
[ADR 0008](0008-cluster-archive-and-blog-placements.md).

## Context

The owner requested any four cluster use cases. The selected operations are
create, update, get and list. The owner approved siteId on get/update and
missing-reference, uniqueness, site-scope and invalid-language failures,
following the existing pages conventions.

## Decision

Implement the selected inbound contracts as framework-independent use cases.
Domain methods retain local validation and normalization. Creation validates
site existence, enabled language, optional parent site/language and global mark
availability through existing ports, then saves a new ACTIVE cluster. A narrow
`IClusterCreationValues` port supplies its identity and initial UTC instant.

Update edits a detached owned cluster, preserving hierarchy and lifecycle.
Get returns an owned cluster or null. List passes only supported filters with
the explicit site scope and rejects mixed-site results without partial data.
Business errors live in domain, permitting technical adapters to translate
conflicts without importing application implementations.

`ClustersModule.register` requires explicit repository and site lookup providers
and exports exactly the four selected operation tokens. AppModule supports
standalone `registerClusters` and joint registration with existing capabilities.
Move, archive and blog-placement use cases remain empty and unbound. This
supersedes the empty-use-case requirements of ADRs 0001 and 0002 only for these
four operations. See [cluster contracts](../arch/domain-contracts.md#implemented-cluster-operations).

## Consequences

Get/update callers supply siteId. No users, roles, REST endpoints, schema/index
changes or concrete persistence/site lookup adapters are introduced. Existing
clusters are not reparented by these operations; future moves still require
ancestor-cycle validation and their agreed concurrency guarantees.

Deterministic fake-port tests verify references, language constraints, site
isolation, optional updates, save results, failure propagation and composition.
Atomic mark uniqueness, persistence timestamps and durable writes remain
provider obligations; the repository contract introduces no version checks.
