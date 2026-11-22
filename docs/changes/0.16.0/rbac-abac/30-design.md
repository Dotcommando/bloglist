# MongoDB authorization design for CMS 0.16.0

This is the proposed persistence contract for [ADR 0091](../../../adr/0091-endpoint-actions-and-site-access.md). Collection names, indexes and migration behavior below describe the target model. Implementation evidence belongs in the feature dossier.

## Collections and references

Each record has a MongoDB `_id`. References use the stable string IDs exposed
by the owning capability. `actorId` is the existing `adminUserId` in 0.16.0.
`siteId` is the stable CMS site ID. Ordinary entity timestamps use UTC BSON Date;
editable aggregates use opaque string versions. Audit actor IDs come from the
trusted request context. Migration-created metadata can use a null audit actor.

| Collection | Document fields in addition to `_id` | Required unique index |
| --- | --- | --- |
| `action_domains` | `domainId`, `ownerKey`, `name`, `description`, `status` | `(domainId)` |
| `actions` | The inventory fields, plus `routeKey`, `allowedObjectScopes`, `status` | `(actionId)`; `(method, routeKey)` for active records |
| `roles` | `roleId`, `scope`, `siteId`, `key`, `name`, `description`, `version`, `createdAt`, `createdBy`, `updatedAt`, `updatedBy` | `(roleId)`; `(scope, siteId, key)` |
| `role_permissions` | `siteId` (null for built-in administrator policies), `roleId`, `actionId`, `objectScopes`, `createdAt`, `createdBy`, `updatedAt`, `updatedBy` | `(siteId, roleId, actionId)` |
| `role_assignments` | `scope`, `siteId`, `actorId`, `roleId`, `createdAt`, `createdBy` | `(scope, siteId, actorId, roleId)` |
| `access_groups` | `siteId`, `groupId`, `key`, `name`, `description`, `status`, `version`, `createdAt`, `createdBy`, `updatedAt`, `updatedBy`. Built-in definitions have a null `siteId` and a reserved `roleId`. | `(siteId, groupId)`; `(siteId, key)` |
| `access_group_memberships` | `siteId`, `groupId`, `actorId`, `createdAt`, `createdBy` | `(siteId, groupId, actorId)` |
| `authorization_guards` | `_id` is a stable `site:<siteId>` or `actor:<actorId>` key; `revision` and `writeGuard` are opaque strings | `_id` |

Use explicit Mongoose schemas and MongoDB validators with required fields, enum
values, bounded strings/arrays and conditional scope shapes. Database validators
enforce the shape. Use-case transactions enforce references and invariants across
collections. Include reverse indexes on `(actionId, siteId, roleId)` for grants,
`(scope, siteId, roleId, actorId)` for assignments, and
`(siteId, actorId, groupId)` for memberships. Use `(actorId, scope, siteId, roleId)`
for site discovery. Verify indexes and actual query plans against the
[persistence conventions](../../../../src/adapters/outbound/persistence/AGENTS.md).

### Catalog metadata

The [CMS](actions-cms.md), [Events](actions-events.md), and
[Bloglist](actions-bloglist.md) inventories supply the endpoint fields. `domains`
references `action_domains.domainId`. The host derives each action's owner
from the `actionId` namespace and validates domains and the dispatcher binding.
`routeKey` is the host's canonical route template for collision checking.
Parameter names alone cannot make two routes distinct. Use the dispatcher's
rules for literals, path remainders and trailing slashes.

`status` is `active` or `retired` for actions and domains. An active action can
reference only active, known domains. `allowedObjectScopes` lists the object
scopes the action can enforce. It is empty for actions outside role assignment.
The current route inventories are baselines for reviewing this field. A route
may support only `all`, for example a site-wide configuration operation, or
support narrower filtering. Public, session and infrastructure admission remain
owned by the relevant boundaries. [Add-on registration](../../../addon-development/authorization.md)
defines how a package supplies action metadata and how changes affect grants.

### Site roles, permissions and groups

A site assignment has `scope: "site"` and a non-null `siteId`. Custom role
definitions use the same site ID. The built-in SiteAdmin and Manager definitions
have a null `siteId` and can be assigned independently on each site. Each
permission references a role and one whole site-scoped action. Manager starts
with an empty grant set on every site.

`objectScopes` is a nonempty set drawn from `own`, `groups`, and `all`. Persist
`all` alone, or one or both narrower scopes, as supported by the action. A
missing grant denies the action. Domains and CRUDE flags carry no authority.
Use `roles.version` as the optimistic token for editing the role and its grant
set together. Role removal must reject while assignments exist or remove those
assignments and grants in the same guarded operation. The deletion UX is open.

Group membership has its own relation. It never grants an action or creates a
site assignment. Each membership points to an account and an access group on
the same site. A group is `active` or `archived`. An archived group retains its
identity so object references stay meaningful. It grants no group access and
accepts no new memberships or object assignments.

The owning mutable object stores `createdBy` and nullable `accessGroupId` beside
its trusted `siteId`. Existing data with no reliable creator keeps a null
`createdBy`. `own` matches the recorded creator. `groups` resolves active
memberships and matches the object's group. `all` still evaluates the site
predicate. New objects get the authenticated creator and a validated group,
where applicable. Group changes use a guarded operation that authorizes the
source object and destination group. A role assignment never crosses the site
boundary, even for a request carrying a known foreign object or group ID.

### Installation-wide administrator

Store one system-owned role with reserved `roleId: "cms.system.admin"`,
`key: "system-admin"`, `scope: "installation"` and `siteId: null`. Persist one
explicit installation assignment for each global administrator. Its fields are
`scope: "installation"`, `siteId: null`, the account's `actorId`, and
`roleId: "cms.system.admin"`. No installation assignment may point at a site
role. The v0.16.0 design reserves installation-level role assignment for this role.

The reserved role must exist and the account must be active. The system
recognizes the reserved identity and protects its metadata and assignment scope.
An authenticated administrator needs installation-wide authority to grant or
remove another actor's global assignment. Creating an account with site roles
does not imply a global assignment.
The Global group derives membership from installation assignments. The Site
group derives membership from SiteAdmin assignments on the requested site.
The combined 0.16.0 migration seeds both definitions and their whole-action
role grants. The null grant site ID means the built-in policy is shared.
Its application still follows the actor's assignment scope. A site created
later needs no copy of either built-in group or the policies for its admins.
Endpoint and add-on availability and business invariants still
apply. Missing assignments fail closed. `allowedSiteIds: []`, role labels and
missing grants do not imply global authority.

Backfill explicit assignments for existing non-deleted administrator accounts,
including blocked accounts, to preserve their existing lifecycle. A blocked
account remains blocked until reactivated. After the migration, console creation
writes the account and its global assignment in one transaction. Extend the
existing [last-administrator invariant](../../../arch/administration-users.md#operations)
to count active accounts with that assignment. Removal, deletion and blocking
use the existing directory serialization boundary to prevent concurrent loss of
the last global administrator. Installation-owned site discovery may expose a
filtered view to delegated accounts based on their current site assignments.

## Authorization resolution and consistency

Resolve the active account, the registered action and, for site-owned requests,
the trusted site. For a delegated actor, fetch only assignments, roles, grants
and applicable group memberships for that site in a consistent policy read.
Union the applicable grant scopes and intersect the resulting object predicate
with trusted `siteId` and
the use case's filters. Apply it before search, ordering, pagination and totals.
Owning use cases enforce the predicate on every affected object and relevant
reference, including commands with multiple effects. Storage/provider errors
are technical failures and confer no access.

Changes to site roles, grants, assignments, groups and memberships update the
site policy revision atomically.
Account lifecycle and installation-admin assignment changes update the affected
actor revision atomically. The policy read captures both revisions as applicable.
For guarded business writes, the owning transaction checks and touches those
guard records with a conditional write, so a winning revocation conflicts with
an in-flight write holding stale authority. Apply the existing object version or
atomic ownership predicate in the same write. Retain the add-on connection fence
in the same transaction where applicable. Technical guard writes do not change
business identity or business versions. Use the current committed policy for new
requests; a worker-local cache cannot independently authorize access.

The transaction ports hide MongoDB sessions, selectors and documents from
domain, application and SDK boundaries. Any action with a side effect outside
the owning database needs a defined admission, revocation and recovery contract
before delegation. Decisions for long-lived subscriptions, preview, private CMS
methods and background execution remain separate from HTTP route registration.

## Rollout and transfer ownership

Add a checksum-verified migration for the new CMS-owned records, validators,
indexes and administrator backfill. Verify on a fresh installation and existing
data before switching enforcement. Existing actor IDs and immutable releases
stay intact. Add-on object attributes and indexes belong to the owning add-on's
migrations. Scope the affected object indexes by site and the predicates needed
for bounded lists and updates. See [migration rules](../../../../migrations/AGENTS.md).

The authorization directory is installation-managed security state, including
site-indexed records. Exclude it from site and partial content exports and
restores. On restore, preserve the target's role and group policy. Portable
dumps omit the working creator and group attributes on pages and rendering
elements. In-place replacement retains the target's attributes for matching
content IDs. Incoming snapshots cannot introduce installation actor or group
references. See the existing
[site dump contract](../../../arch/site-dumps.md).

## Access workspace follow-up

The login and current-session APIs already publish effective site grants. The frontend uses action IDs from this projection for navigation and controls. Its own workspace mapping is explicit because action domains describe effects. The HTTP dispatcher and owning operation retain authority over every request.

The URLs workspace uses the session's three effective site grants for the
virtual-folder creation link. It inserts the selected catalog path as plain
localized link text and uses the existing encoded `urlPath` query to open the
editor. The dispatcher and the owning operation authorize the save.

Use the current page editor's permission check for the missing list hint beside
the existing position fields. Use the role editor's current grant selection to
show and remove a list-scope hint when the position or list checkbox changes.
The position API retains its existing site authority and placement checks.

For case 2, keep the detailed publication panel on the page-options grant.
Use already-loaded site-level availability when the page-options grant is
missing. If neither source supplies availability, the dedicated published
output endpoint determines whether its result exists. Keep the role hint on
draft update once draft read is selected, within the role's explicit grants.

Case 3 uses a separate page action for a readable draft when the actor has
the publish grant and lacks update. Verify the saved address and compatible
template from authorized page publication options. Send an empty body to the
existing publish endpoint. A lost acknowledgement requires a deliberate
reload before retry. Release, draft, routing and TV write contracts remain with
their existing owners.

Case 4 leaves each catalog's payload under its current action. Check the page
editor link on the selected URL through existing scoped page read. Associate
the result with the selected site and page and ignore results after a selection
change. The role editor displays one warning per site-wide action in its own
domain and derives it from the current role's selected scopes.

Case 5 takes the saved template identity from the already readable draft when
the actor cannot load publication options. Use native read-only text controls
and disable selectors for read-only TVs. The ordinary draft submit continues
to check the separate TV save action before invoking the TV write.

Case 6 uses a profile query on the existing JSON-LD workspace route. Resolve
the ID only in the current site's authorized catalog. The linked profile can
be reopened after reload. The read-only form inherits the existing catalog
write guard. In a readable draft, derive assignments from the saved template
when page publication options are unavailable.

Case 7 renders the saved Open Graph URL as a read-only field when the library
is unavailable. Keep the value in the normal draft payload. Pass content
permission to the existing image input and chooser to gate the private URLs.
The ordinary image selection uses the already configured public site origin.

Case 8 leaves preview actions out of the Pages navigation requirements. Show
the guidance in the Pages domain for the selected preview action when draft
read is missing. Keep the JSON-LD settings link on the catalog read action.

Case 9 uses the existing source save pipeline and backup acknowledgement for
all three source kinds. Site publishing access selects the primary form action
and the draft confirmation. Pending backup and publication error states keep
their existing messages and behavior.
The browser uses a draft-only Snippet update for both buttons so only Save &
apply requests publication. The server permits the existing API consumer
refresh only with site publication access on that same site.

Case 10 validates the using page through the actor's existing page-read scope
before rendering. Annotate page usages against the same scope in the source
response. Use at most one scoped page query for a mixed scope. The private
preview document retains its owner and trusted site and page. On each read
reauthorize the document action on that site and the page's current read scope.

Case 11 extends source usage annotations to templates and chunks. Evaluate
template read for the current site. Batch scoped chunk targets using the
existing catalog and read scope. Reuse the page annotations for preview and
navigation. Both editor surfaces render plain text if a target is unreadable.

Case 12 uses the existing Files entry action set. Without list access, show a
single visible message on desktop and narrow screens without creating a tree or
write form. Require a loaded current library and applicable write permission on
the ordinary upload and folder submission paths.

Case 13 applies the combined move and review guard to the inline title and
both move entry points. Guard the submit handlers as well as the controls.
Force delete in the browser requires an explicit review with usages of the
current file version. Use a single operation-specific hint in the card.

Case 14 maps the stable media output keys to their proposed addresses in the
same public root. Batch authorized read checks for usage targets in the Files
HTTP response. Link authorized targets in the card and confirmation. Route
address rewrites through ordinary draft saves and the existing immutable
address-only publication, including when a saved Snippet is affected.

Case 15 retains the existing private-content guard on all detail links and
preview bytes. Show the guidance next to the metadata when content read is
missing. The file tree continues to use its existing file-type icons.

Case 16 keeps the catalog and server suggestion grants independent. Display
saved parent and destination using the authorized catalog. Gate new selection
on suggestions, use the saved identity when that grant is absent, and retain
the supported path and redirect-status submissions.

Case 17 uses the scoped page check from case 4 when draft read is assigned.
When the action is absent, show the same guidance for a linked page and omit
the page request. The URL summary retains its existing catalog contract.

Case 18 chooses the acknowledgement from the existing mutation result and
the user's routing publication grant. The separate apply action posts an
empty body and needs no route selector. A null publication result explains
the need for an initial content release.

Case 19 keeps the saved address fields readable and uses the existing update
guard for writes. Present rebuild guidance next to the independent publication
action. Track an acknowledged public-origin change for the sitemap handoff.
The rebuild passes no settings from the form to the publication endpoint.

Case 20 reuses the existing handler creation and subscription endpoints. The
root form chooses a handler kind, while a site hook card uses its own kind.
Assigning requires the subscription grant and an available site hook of the
same kind. Clear the title after confirmed creation and refresh the authorized
catalog if the second request fails. Navigate to a new subscription after
releasing the workspace busy guard.

Case 21 currently covers unbound screens. Add-on summaries indicate a screen
from the live runtime entry or the trusted registered definition. Apply the
current administrator grant to both runtime asset and manifest requests. Keep
connection summaries and explicit management requests on their existing actions.
Package manifests currently validate endpoint declarations. These declarations
provide neither a screen binding nor an active Action at the dispatcher. The
bound-screen path depends on matching the selected serving runtime to its
registered Actions and enforcing its scopes at the owning operation. The host
can then project accessible screens and pass action availability to controls.

The shared Manager defaults apply per site until an explicit Manager policy is stored. Existing non-empty grants remain authoritative. The first explicit save records a Manager marker in the same transaction as grant updates, so an empty policy stays empty. Custom account creation reuses the installation account API and verifies the role’s owning site in the existing account transaction. The site authorization write guard serializes that check with role changes. The Access endpoint rejects changes to the built-in administrator roles.
