# ADR 0005: Initial local application boundary

Date: 2026-10-24

Status: Accepted by the owner on 2026-10-24. See the
[local application contract](../arch/local-application.md) for the resulting
implementation boundary and invocation.

The initial integration execution cadence recorded below is superseded as of
2026-11-18 by the [testing policy](../cms-development/testing-policy.md). The original
decision and its implementation scope remain historical evidence.

## Context

The first application implementation needs concrete persistence and composition
without making an identity-provider subsystem a prerequisite. The owner selected
one use case at a time, test-first application and adapter behavior, AppModule
registration and focused integration coverage executed after five new use cases.
Three initial-boundary questions were answered before unattended implementation.

## Decision

- Start with CreateSite, GetSite, ResolveSite, CreatePage and GetPage, in that order.
- Invoke their inbound tokens through a local Nest application context/AppModule
  with an explicitly trusted local operator. Keep administrative HTTP endpoints
  and network authentication outside this initial scope. The local trust boundary
  is an explicit composition choice, never a permission granted by submitted IDs
  or a fallback for absent credentials/configuration.
- Keep existing inbound inputs/results unchanged. Add capability-owned site/page
  access ports using the methods specified in the
  [use-case contract](../arch/scenario-001-use-cases.md). They enforce access from
  the trusted invocation context; application tests also exercise denied access.
- ResolveSite returns null for an archived site. Authorized GetSite remains
  available, and administrative creation/read of draft pages is permitted in an
  archived site. These operations do not reactivate or publish the site. No site
  status field needs to be added to the page capability's site-reference contract.
- Implement the entire existing ISiteRepository and IPageRepository contracts
  with test-first adapter behavior. Preserve their interfaces and uniqueness
  semantics, without stubs, unrelated inbound use cases or a mandatory cluster
  integration.
- Preserve the fake-port unit tests when real adapters are bound in composition.
  Write focused integration tests alongside each use case and execute accumulated
  integration coverage at the fifth-use-case boundary, following AGENTS.md.

## Consequences

The initial scope can exercise real Nest composition and MongoDB persistence
without public administrative endpoints. It does not yet deliver a public site
or provide remote administration. Future network adapters require their own
authenticated identity/access integration and cannot inherit local-operator trust.

Archived-site domain resolution and draft administration now have explicit
semantics. Complete archival effects on active publications, direct delivery and
language removal remain outside this scope. The full repository implementations
may contain methods not called by the first five inbound operations; this does
not authorize implementing the remaining application workflows.
