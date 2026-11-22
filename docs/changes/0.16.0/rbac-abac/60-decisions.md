# Authorization design decisions

The owner approved the [endpoint-level model](../../../adr/0091-endpoint-actions-and-site-access.md)
for 0.16.0 and requested the MongoDB schema and consolidated add-on authoring
requirements before implementation.

The [storage design](30-design.md) proposes an explicit installation assignment
to one reserved administrator role. This preserves the console account's scope
for future sites and gives account lifecycle operations a concrete invariant to
protect. Site role definitions, permissions, assignments, access groups and
memberships have independent records with enforced same-site references. The
runtime catalog comes from code-owned declarations. This keeps package metadata
and installation-managed grants under distinct owners.

The [add-on authoring guide](../../../addon-development/README.md) owns development and
verification procedures. Existing architecture contracts own the behavior of
the current host. The new registration requirements describe target behavior.

Open decisions include the manager's initial action set, allowed scopes per
endpoint, concrete SDK declaration and activation format, existing object and
dump ownership handling, non-HTTP authority, and the role-removal interaction.

On 2026-11-19 the owner authorized implementation and named the three built-in
roles SystemAdmin, SiteAdmin and Manager. SystemAdmin preserves the old admin's
authority. SiteAdmin is bounded to an assigned site and the General settings
exception. Manager receives no implicit business actions while its defaults are
deferred. The built-in role definitions are shared; site assignments and Manager
grants still carry their own trusted site IDs.

The owner clarified that the General restriction applies to installation
settings. SiteAdmin may use General settings for an assigned site.

The owner confirmed that installed Events and Bloglist packages without action
declarations retain their public routes and SystemAdmin access until their
packages are updated. Object-level ABAC starts in CMS. Bloglist and Events will
enforce their business object scopes in their own releases.

The owner then selected the default editorial workspaces for Manager.
The policy grants draft editing and the existing file and URL editing
operations. Whole-site and route publication have separate actions.
Account creation continues to require SystemAdmin, including when creating
someone with a custom site role. See the [interface checklist](interface-access-decisions.md)
for behavior that depends on multiple domains or endpoints.
