# Add-on actions and authorization

CMS 0.16.0 supports runtime-bound add-on Actions under
[ADR 0091](../adr/0091-endpoint-actions-and-site-access.md). Use SDK `0.6.0`.
The `authorization` field in transfer metadata and the package manifest uses
`IAddonAuthorizationDeclaration` from `@zarya/addon-contracts/addons`. It has
`version: 1`, `domains`, `actions`, and optional `adminUi` bindings.

## Declare endpoints and domains

- Supply a versioned, code-owned declaration for **every HTTP endpoint** in the
  package, including public routes. Generate `server/http-routes.json` from the
  router's exact `{ method, route }` pairs and include it in the manifest's file
  checksums. Export the same array as `httpRoutes` from the server entry. The
  coordinator validates the JSON against the declaration during package
  preparation. The serving process checks the module export before calling
  `createRuntime`. Each Action has its own method and template within the
  manifest `routes` prefixes, which govern routing ownership and pauses.
- Use a unique `actionId` rooted at `<addonKey>.`. Supply the method, route
  template, short and full descriptions, domain IDs, scope, admission and
  five CRUDE booleans. Declare the object scopes the owning operation can
  enforce for a delegable action. Declare add-on-owned domains under the same
  namespace. Refer to an existing CMS domain when an action also operates on
  that documented CMS capability. The host resolves and validates these IDs.
- The host rejects missing or extra declarations, duplicate IDs or normalized
  routes, unknown domain references, declarations under foreign or reserved
  namespaces, and incompatible admission or scopes. A descriptor registers
  metadata. Only the host manages the catalog, grants, role assignments and
  access groups.

See the [MongoDB design](../changes/0.16.0/rbac-abac/30-design.md#catalog-metadata)
for catalog fields and review the current [Events](../changes/0.16.0/rbac-abac/actions-events.md)
and [Bloglist](../changes/0.16.0/rbac-abac/actions-bloglist.md) inventories for
endpoint examples.

## Enforce the grant at the owning boundary

The host resolves the actor, site and registered action and admits protected
requests before reading their bodies. `host.authorization.read(request)`
returns the verified `actorId`, `siteId`, `actionId`, `scopes` and `groupIds` for
the request delivered to that runtime. The owning operation applies those scopes
to objects, referenced records, search results and counts before pagination.
It still applies the connection policy and its own business conditions. Declare
only `all` when an operation supports site-wide access exclusively.
Take creator and group attributes from trusted context or validated same-site
references. Apply authorization and ownership predicates to writes using the
guarded [transaction design](../changes/0.16.0/rbac-abac/30-design.md#authorization-resolution-and-consistency).
Pass the HTTP request, a permit obtained from the connection policy, and the
active MongoDB session to `host.authorization.write(request, permit, session)`
inside the same transaction as the mutation. Apply the returned current scope
to the write predicate. The host rechecks the role, generation and connection
permit in that transaction.

A single grant authorizes the entire endpoint within its granted object scope.
An operation that needs a narrower grant must have its own endpoint. Public
actions retain their declared public admission, site resolution and availability
checks. Server extension methods, hooks and background jobs each use the owning
invocation authority, even when they reuse the same underlying use case.

## Bind screens and controls to Actions

The [interface resolution](../changes/0.16.0/rbac-abac/interface-access-resolutions.md)
defines the behavior for delegated screens. A screen and its nested navigation
declare `adminUi.views` entries with a view `id` and required `actionIds`. Use the
view ID in the `?view=` parameter. Use `host.can(actionId)` to gate controls
within the bound view. On a connected site the add-on appears in
navigation when at least one explicitly bound screen is available. On an
available screen, explain a missing operation grant where it helps the user
complete their task.

Use stable Action IDs for bindings. A domain can group several Actions, and one
Action can appear under several domains. The stored grant is the same in each
case. For example, the Action for listing requests can open a list screen while
the separate update Action governs its Save control. Requests still pass the
server's role and object checks.

The current [host contract](../arch/site-addons-contracts.md#navigation-and-theme-adr-0038)
documents the supported behavior for screens without bindings. Delegating bound
screens requires activation-time registration, dispatcher enforcement and an
explicit UI binding contract.

## Evolve a package without widening grants

Keep an existing action ID for the same method, route and authorization meaning.
Descriptions and display metadata can be corrected while preserving behavior.
If an endpoint changes its authority boundary, adds a command or expands the
protected data it can expose or modify, declare a new action ID and review grants
explicitly. The host retires removed or replaced IDs and prevents silent reuse
of old grants. New actions start without delegated grants.

Package activation must bind catalog entries to the runtime actually serving the
declared routes. Validate collisions before selection. Failed activation cannot
publish candidate actions or alter current grants. Compatible overlap and
exclusive pauses use the [runtime update contract](../arch/live-addon-updates.md).
When runtimes overlap, action resolution must match the selected handler's
authority. Include the [authorization test cases](testing.md#authorization-for-0160).

Prepare a declaring runtime for each add-on used with 0.16.0 enforcement.
Preserve immutable installed artifacts and applied migration receipts. An HTTP
route without validated metadata cannot participate in the new dispatcher.
