# Cluster archive and blog placement operations

Status: Accepted

Move and reorder complete cluster operation support in
[ADR 0009](0009-cluster-moves-and-blog-reordering.md).

## Context

The owner requested four more unimplemented cluster use cases. The selected
operations are archive, add blog, update blog placement and remove blog.
The owner approved required siteId, duplicate-add conflicts, missing-reference
failures and an error on repeated removal. Update/removal do not depend on
catalog blog existence.

## Decision

Apply the existing site-scope and domain error conventions to all four inputs.
ClusterScopeService loads and detaches the owned cluster before archive or
placement access. ClusterBlogPlacementScopeService serves update/removal by
checking owner scope first, validating the exact pair and returning a detached
placement. Use cases retain sequencing, mutations and persistence outcomes.

Archive changes cluster state without cascading into pages or placements.
Addition validates global blog existence and pair uniqueness, then supplies a
new opaque placement identity and UTC instant through IClusterBlogCreationValues.
Update edits only position/notes/visibility. Removal deletes only the owned
existing pair. Existing finite-position and optional-value semantics remain.

ClustersModule now requires explicit placementRepository and blogLookup providers
in addition to the existing repository and siteLookup. It exports eight inbound
operations; AppModule registration remains the composition entry point. Move
and reorder remain unimplemented. This extends ADR 0007 and supersedes the
empty-use-case requirements for these four files only.

## Consequences

Callers provide siteId and the two additional module dependencies. No user roles,
schema changes, automatic cascades or concrete persistence/catalog adapters are
introduced. Persistence must atomically enforce pair uniqueness and report
missing removal targets; versioned updates are not added to existing ports.

Fake-port tests verify inherited site isolation before catalog/placement reads,
defaults, finite fractional positions, visibility, duplicate/missing cases,
detached mutations, error propagation and provider composition. Database
uniqueness and concurrent removal behavior remain adapter obligations.
