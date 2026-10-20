# Cluster moves and blog reordering

Status: Accepted

## Context

The owner requested the remaining cluster use cases, move and reorder blogs.
The owner approved partial position batches and an atomic move contract with
expected source state and serialization of competing hierarchy writes.
The existing repositories had ordinary saves and a batch position operation,
but no safe hierarchy-move capability.

## Decision

Add required siteId to both inputs, following the established ownership rule.
Reuse ClusterScopeService. Move validates a detached source and the full new
ancestor chain, rejecting self/descendant moves, existing cycles, missing
ancestors and site/language mismatches. It then calls the new repository move
operation once with expected source state and the proposed parent, returning
the saved entity. No ordinary save or automatic retry is used.

The move port must revalidate current source/ancestor state and serialize
hierarchy changes atomically. Existing-cluster saves must preserve persisted
parent identity so stale editorial snapshots cannot bypass this boundary.
Snapshot-only reads with disjoint writes cannot guarantee acyclic concurrent
moves; concrete adapters must provide a shared concurrency guard or equivalent
serialization. Stale source state uses ClusterConflictError.

Reorder applies a domain policy for unique nonblank blog IDs and finite
positions. It validates every requested existing pair, then calls updatePositions
once. Partial lists preserve other pairs; tied/negative/fractional positions
remain valid. Empty lists succeed after ownership validation. The persistence
port must recheck membership and commit all requested positions or none.

Export the two operations from the existing ClustersModule, completing all ten
inbound contracts. No new module providers are required. This extends ADRs 0007
and 0008 and supersedes the empty-use-case requirement for the final cluster
files. Detailed behavior is in [cluster contracts](../arch/domain-contracts.md#implemented-cluster-operations).

## Consequences

Callers supply siteId and cluster repository implementations now provide move.
Existing error conventions, UTC/persistence timestamp ownership and external
adapter composition remain. No schemas, migrations, user roles or public REST
endpoints are added.

Deterministic fake-port tests cover ancestor traversal, cycles, site/language
isolation, partial batches, domain failures, exact atomic commands and
stale/membership failure propagation. Actual hierarchy serialization,
concurrent database guarantees and atomic batch rollback remain work for the
future persistence adapter and its integration suite.
