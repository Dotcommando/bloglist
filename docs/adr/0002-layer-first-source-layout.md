# Layer-first backend source layout

Status: Accepted

## Context

The owner requires the shared backend's architectural layers to be top-level
directories under `src`. The capability-first directory layout in ADR 0001 is
replaced by this decision. Domain responsibilities and operation contracts do
not change.

## Decision

Use the following layout, with capability grouping inside each layer:

```text
src/
  adapters/
    inbound/rest/
    outbound/persistence/mongodb/<capability>/
  app/use-cases/<capability>/
  domain/<capability>/
  ports/
    inbound/<capability>/
    outbound/<capability>/
  infra/
    app.module.ts
    <capability>/<capability>.tokens.ts
  main.ts
```

Capabilities remain `sites`, `clusters`, `pages`, `routing` and `creators`.
Within adapters, group by direction and integration responsibility, then by
concrete technology or protocol, and finally by owning capability. MongoDB
persistence follows this ordering; new integrations follow the same principle
without introducing unused directory levels. Shared technology grouping does
not change capability ownership or permit cross-capability persistence access.

Capability ownership and cross-capability lookup boundaries remain explicit
despite the shared layer directories. The existing root greeting controller and
its static-response helper stay together in the REST adapter; NestJS composition
moves into `infra`. The greeting endpoint's behavior is preserved.

Imports continue to point inward. Domain has no framework or outer-layer
dependencies. Ports depend on domain; use cases depend on ports and domain.
Adapters may use their own integration support code and inward contracts, with
the existing leaf-token exception for injection. Composition wires adapters in
`infra`. Capability code does not directly import another capability's domain
or implementations; consuming capabilities own their lookup contracts.

All 40 use-case files remain empty. No domain behavior, persistence fields,
collections, indexes, REST responses or adapter implementations are changed by
this relocation.

## Consequences

Source paths, test imports and durable repository rules use the layer-first
layout. Architecture regressions verify the top-level directory structure,
adapter placement, inward import boundaries, capability isolation and empty
use-case files. The previous `src/<capability>/<layer>` paths must not reappear.
