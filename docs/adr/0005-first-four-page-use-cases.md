# First four page use cases

Status: Accepted

The remaining page operations and their site-scoped inputs are added by
[ADR 0006](0006-remaining-page-use-cases.md), extending the scope below.

## Context

The owner selected create, update, assign to cluster and publish as the first
four page operations, following token and architecture-test order. The owner
approved required siteId on existing-page mutation inputs and the proposed
missing-reference, conflict, site-scope and invalid-language failures.

## Decision

Implement only these four inbound contracts. Add required `siteId` to update,
assignment and publication inputs. Retain framework-independent use cases and
business errors in domain, following routing. Existing page domain methods own
local invariants and publication transitions; use cases own sequencing and
persistence outcomes.

`PageScopeService` supports update, assignment and publication by loading,
checking site ownership and detaching the target page. `PageRelationshipsService`
supports creation and non-null assignment by validating the site, enabled page
language and optional matching site/language cluster. Clearing a cluster needs
only the owned page. Shared responsibility does not move complete workflows out
of use cases.

`IPageLifecycleValues` supplies opaque identities and UTC instants through a
system adapter. Creation defaults to DRAFT with schema-compatible values;
publication preserves the domain's first-publication timestamp semantics.
All four operations return the saved entity. Failure leaves loaded page objects
unchanged.

`PagesModule.register` requires explicit repository, site lookup and cluster
lookup providers. `AppModule.registerPages` enables it alone and the existing
combined registration gains a `pages` option. Only the four implemented inbound
tokens are exported; archive, get and list remain empty. This supersedes the
empty-use-case requirements of ADRs 0001 and 0002 for these operations only.

See [page contracts](../arch/domain-contracts.md#implemented-page-operations)
for defaults, operation results and agreed failures.

## Consequences

Existing-page callers must supply siteId. This increment checks site equality
without introducing users or roles. Publishing persists page state; URL
assignment and static output publication retain their separate ownership.
Schemas, indexes, environment settings and public REST endpoints are unchanged.

Deterministic fake-port tests cover site isolation, required references,
language constraints, optional-field updates, original publication instants,
saved results and failure propagation. Concrete persistence/lookup adapters,
atomic mark uniqueness and durable saves remain explicit provider obligations.
