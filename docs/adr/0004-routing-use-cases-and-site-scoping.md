# Routing use cases and site-scoped history

Status: Accepted

## Context

The owner requested routing use cases after sites. Existing routing ports
already define initial URL assignment, atomic address changes, exact path
lookup and URL history. History originally accepted only a URL identity.
The owner approved routing failure categories and requested checking siteId
only; users and roles are not yet modeled.

## Decision

Implement the four existing inbound operations, adding required `siteId` to
`IGetUrlHistoryInput` with owner agreement. Validate URL ownership before reading
history. Assignment and changes validate page and parent ownership through
capability-owned ports; no cross-capability implementation imports are needed.
Path lookups keep their site filter and reject out-of-site results.

`PageUrlPreparationService` serves both assignment and address changes. Its
separate responsibility is constructing a domain-valid PAGE address and checking
page/parent references and mark/path availability. Use cases retain sequencing,
current-URL preconditions, persistence and outcomes. `IUrlCreationValues` and its
system adapter provide opaque identities and UTC instants, following the sites
composition pattern.

Validate the proposed redirect on a detached entity, then invoke the existing
atomic `changePageUrl` port once with the expected previous state. Do not mutate
the loaded previous URL or use independent saves for the redirect and new URL.
Return the new URL after acknowledgement; the existing atomic port returns
`void`, so no post-commit read is required. No automatic retry is introduced.

Expose `RoutingNotFoundError`, `RoutingConflictError` and `RoutingScopeError` as
business errors in domain. This permits outbound adapters to translate
technology-specific conflicts without importing application code. Existing
domain validation and outbound errors propagate. Detailed behavior and failure
semantics live in [domain contracts](../arch/domain-contracts.md#implemented-routing-operations).

`RoutingModule.register` requires explicit URL repository and page lookup
providers. `AppModule.registerRouting` connects it alone; the new
`AppModule.register({ sites, routing })` supports joint composition while
preserving `registerSites`. There is no fallback persistence or page lookup.

This supersedes the empty-routing-use-case requirement of ADRs 0001 and 0002.
Cluster, page and creator use cases remain empty.

## Consequences

History callers must supply siteId. Site equality checks do not implement user
authorization; no users, roles, REST endpoints or authentication are added.
Existing schemas, indexes, migrations and environment settings are unchanged.

Tests use deterministic fake ports to verify site isolation, uniqueness
prechecks, domain failures, atomic command contents, completion ordering and
stale-write failure propagation. Actual transaction rollback, concurrent
uniqueness and durable history remain obligations for a future persistence
adapter and its integration suite.
