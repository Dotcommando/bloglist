# Administrative authorization

CMS accounts and sessions belong to the installation. The migration
`0015-rbac-and-transliteration` initializes the authorization directory and the core
action catalog. Existing non-deleted administrators receive SystemAdmin
assignments. Their existing blocked status and account versions are preserved.
The migration also seeds the read-only Global and Site groups and built-in
administrator grants in `role_permissions`.

| Role | Effective authority |
| --- | --- |
| SystemAdmin | Installation administration and every site. Console creation uses this role by default. |
| SiteAdmin | Core administrative actions for assigned sites, including the site's Main settings. Installation General and installation-owned operations require SystemAdmin. |
| Manager | Assigned-site discovery and a default editorial policy for Pages, Chunks, Snippets, Files, and URLs. A site's explicit Manager policy replaces these grants. |

Sign-in and current-session responses project the effective site assignments
from MongoDB. An existing session sees current grants on its next request.
The dispatcher resolves the HTTP method and route to an action, and requires a
grant for both administrator roles before reading the body. A whole-action
SystemAdmin grant applies across the installation. A SiteAdmin grant applies
within an assigned site. The SiteAdmin site-discovery grant returns assigned
sites only. Installation management remains reserved to SystemAdmin. The action
must be active in the catalog. The owning operation continues to authenticate
and apply its site and object checks.
Installation settings also check SystemAdmin in their owning operations.

In site Settings / Access, SiteAdmin and SystemAdmin can inspect the action
catalog, edit Manager grants, and create, edit or remove custom site roles.
A grant covers the complete endpoint. The permissions table offers the object
scopes supported by that endpoint. The editor supports independent site access
groups, memberships, content assignment and archiving. Role assignments and
memberships target accounts already assigned to the site. The server validates
same-site references and saves role and group changes under a site policy
revision. Global lists SystemAdmin assignments across the installation and is
visible to SystemAdmin. Site lists SiteAdmin assignments for the selected site.
These two groups derive membership from role assignments and are read-only.
Content assignments use custom site groups. The permission editor shows the stored
System Admin and Site Admin grants as read-only, and the server rejects changes
to those policies. SystemAdmin can create an account in
Settings / Access / Create user with one of the built-in roles or a custom role
on that site. The Users tab in the same section lists installation accounts
and is available to SystemAdmin.
The existing installation account editor also remains available to SystemAdmin.
The account and its validated initial assignment are stored in one transaction.

Manager and custom role grants control HTTP admission and the administrative
workspace. The browser uses action IDs to decide which menu items, views, and
controls to offer. For example, a page creation grant offers the create
button without loading the page tree when the account lacks the list action.
Authoritative site and object checks still run on the server.

The Manager defaults apply until the site saves its own policy.
The default policy supports individual page publication and the full URL
workspace, including applying route changes. Read access to the site settings
supplies the addresses used by URL links. Rebuilding the entire site remains
a separate grant.
The combined migration stores that choice independently of the grant
rows, allowing a site to remove all Manager grants. Earlier non-empty policies
remain explicit. Earlier empty policies had no marker and receive the defaults.
The authoring actions and publication actions have separate grants.

Own and Groups apply to page and chunk creation, list, read and update, and
to snippet creation, list and read. Snippet updates can republish pages, so
that endpoint currently requires whole-site permission. The query always
includes the assigned site and the allowed creator or active group. Writes
repeat authorization in the owning transaction. The creation endpoints accept
an optional `accessGroupId` and derive `createdBy` from the authenticated actor.
Content without creator or group metadata remains eligible for whole-site
permission. Site administrators can set or clear a content group in Access.

Opening a specific draft in the editor requires `cms.pages.read` on the page.
Saving from the editor also requires `cms.pages.update` on the page. The
`cms.pages.list` action governs loading the tree separately. The role editor
shows a read-permission hint next to a granted update action when no read
scope is selected.

`POST /api/admin/sites/:siteId/pages/:pageId` accepts an authorized update even
when the actor cannot read the page. HTTP 200 returns the saved draft only when
the actor's independent read scope matches the saved object. Otherwise the
response is `{"saved":true}`. The update's ordinary validation, write scope
and failure statuses apply to either response shape.
The editor acknowledges a receipt-only save and closes the draft fields.

The combined migration adds validators and query indexes
for the optional content fields. Portable site dumps omit local ownership.
An in-place restore keeps the target's ownership for matching content IDs.

Installed Events and Bloglist packages without action declarations keep their
public routes and SystemAdmin access through the legacy add-on dispatch grant.
The host limits this grant to routes handled by an installed package without
action declarations. The wider
[ADR 0091](../adr/0091-endpoint-actions-and-site-access.md) records the activation
contract for declaring packages. See the
[verification boundaries](../changes/0.16.0/rbac-abac/40-cases.md).
Site snippet execution cannot use installation account administration or create
sites through the private CMS API.

## Initial URL for a draft

A request authorized for `cms.pages.create` without `cms.urls.materialize`
receives a working URL derived from the page H1 and its language. A selected
parent contributes its current site-owned PAGE URL. Virtual folders and manual
paths require the URL action. An actor with a publication grant can publish at
an assigned URL by omitting the path. Creation saves the page and routing
record together after the page and routing checks.

The site settings read and update actions govern the transliteration tables.
The [0.16.0 decision log](../changes/0.16.0/rbac-abac/interface-access-resolutions.md)
records the corresponding editor behavior.
