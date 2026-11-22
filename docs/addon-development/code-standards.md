# Add-on code standards

Apply the shared [backend structure](../cms-development/feature-design.md#backend-structure-and-dependencies),
[source conventions](../cms-development/feature-design.md#source-and-configuration-conventions)
and [failure and recovery rules](../cms-development/feature-design.md#error-outcomes-and-recovery).
The requirements below apply at the package and host boundaries.

## Capability and layers

- Organize the add-on under `src/domain`, `src/app`, `src/ports`, `src/adapters`
  and `src/infra`, with dependencies pointing inward. Model the actor, trusted
  site, owned data, business invariants, expected version, and retry semantics
  before expanding the interface.
- Expose the same use case through its required HTTP, CMS extension, hook or
  background adapter. Keep business rules in the owning use case and domain.
  Add each persistence or browser dependency only where the use case needs it.
- Bind cross-capability operations through small consumer-owned ports and the
  [portable SDK](../../packages/addon-contracts/README.md). Keep NestJS, Mongoose,
  HTTP DTOs, host types and database sessions outside domain and application
  contracts. Access other capabilities through their contracted operations.
  Preserve independent build and package boundaries for CMS, add-ons and sites.

## Site data and concurrent effects

- Partition business documents, indexes, queries, caches and jobs by the trusted
  `siteId`. Validate same-site references to other entities. Use database
  uniqueness for invariants and transactions for cross-document effects as
  required by the [persistence conventions](../../src/adapters/outbound/persistence/AGENTS.md).
- Own the migration directory, business collections and receipt namespace in
  the add-on package. Follow the [migration rules](../../migrations/AGENTS.md)
  and [host migration contract](../arch/site-addons-contracts.md#persistence-and-verification).
  Provision the business schema through owned migrations. Theme import serves
  the site content workflow.
- Carry the host's captured connection permit into the owning transaction and
  apply the [connection fence](../arch/site-addons-contracts.md#runtime-and-frontend-extension-contracts).
  Enforce object access, expected versions and business invariants at the
  owning boundary. Define how to reconcile a timeout or a lost response.
- Site-serving forks have process-local memory, timers and pools. Use the owning
  persistence or lease contract for installation-wide uniqueness, idempotency,
  durable scheduling and once-only work. Account for per-process resources and
  implement the SDK [shutdown and disposal boundary](../arch/live-addon-updates.md#execution-and-failure-boundaries).
  On shutdown, stop admitting add-on-owned scheduled work and finish or cancel
  owned work within the supplied deadline. Keep final disposal in `close()`.
  Follow [asynchronous ownership and cleanup](../cms-development/feature-design.md#asynchronous-ownership-and-cleanup)
  for promises, streams, timers and cancellation.

## HTTP and server extensions

- Define inputs, projections, resource limits and errors for each entry point.
  Use structured validation and a trusted host identity. Keep public DTOs
  separate from private administration projections. Apply the applicable
  [security boundary checks](../cms-development/security-verification.md).
- Expose an operation to server-side `cms` callers only through an explicit
  versioned descriptor. Share the owning use case with HTTP when appropriate.
  Follow the [system API bridge contract](../arch/system-object-api.md#snippet-and-add-on-bridges)
  for the descriptor shape and connection access class. A Query declaration
  covers the entire operation, including nested CMS calls and external effects.
  Preserve query-only authority across nested calls.
- Preserve each interface's pagination envelope and business fields. For
  repeated reads, reuse a suitable batch operation. When a new one is needed,
  specify ownership, order, missing-item behavior and item-count and encoded-size
  bounds. Record the owning transport limits with units.

### Server extension example

Include the descriptor in the add-on's `createRuntime` result as `cms`.

```typescript
import { AddonOperationAccess } from '@zarya/addon-contracts/addons';
import { BusinessError, BusinessErrorCode } from '@zarya/addon-contracts/business-error';
import { CmsExtensionOperationKind } from '@zarya/addon-contracts/cms-extensions';
import type { ICmsAddonExtension } from '@zarya/addon-contracts/cms-extensions';

const extension: ICmsAddonExtension = {
  version: 1,
  objects: {
    cards: {
      get: {
        kind: CmsExtensionOperationKind.Query,
        access: AddonOperationAccess.PublicEnabled,
        execute: async (input, context) => {
          if (typeof input.pageId !== 'string') {
            throw new BusinessError(BusinessErrorCode.Validation, 'pageId is required');
          }
          const page = await context.cms.pages.getPublished({ pageId: input.pageId });
          return page ? { pageId: page.pageId, title: page.title } : null;
        },
      },
    },
  },
};
```

Call the registered query through `cms.extensions[addonKey].cards.get({ pageId })`.
The Synthetic add-on exercises owned persistence, guarded writes, retained
reads after disable, and CMS calls through the captured host and method context.

## Administration and browser code

Use the [public admin host](../arch/site-addons-contracts.md#navigation-and-theme-adr-0038)
and the [add-on workspace layout](../arch/admin-frontend.md#add-on-workspace-layout).
Keep browser bundles free of server dependencies and secrets. Use site-managed
time zones for display. Browser controls can reflect server capabilities.
Actual authority comes from the server's owning operations.
