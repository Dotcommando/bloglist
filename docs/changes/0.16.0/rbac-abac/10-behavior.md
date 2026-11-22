# Endpoint action authorization behavior

The [accepted model](../../../adr/0091-endpoint-actions-and-site-access.md)
targets CMS 0.16.0. An administrator uses the Actions catalog to inspect the
effects of an endpoint and the role editor to grant access to it. A site manager
works within assigned roles and the resulting object scopes.

| Scenario | Expected behavior |
| --- | --- |
| Browse the catalog | Each registered method and route template has an action with a stable ID, short and detailed descriptions, domains, and CRUDE flags. |
| Grant the Bloglist cluster membership action | A single grant covers add, reorder, and remove within the selected scope. The catalog displays `C-UD-`. There is no create-only checkbox in the grant editor. |
| Grant an action listed under Clusters and Blogs | Editing its permission from either domain changes the same role grant. A different action in either domain remains independently assignable. |
| Work as a manager with Groups access | The manager can use the action on objects assigned to a group they currently belong to on that site. A group on another site, or an add-on domain with the same name, grants no access. |
| Combine Own and Groups access | The manager can access their own objects and objects assigned to their groups. An unassigned object with no recorded creator requires All access. |
| Assign a manager to one site | The manager's site selector exposes the assigned site. An All grant for an action on that site gives no access to objects on another site or to installation-wide operations. |
| Create an administrator through the console | The account has the installation-wide admin role and can administer existing and newly created sites without individual site assignments. |
| Apply the 0.16.0 migration | The system provides SystemAdmin, SiteAdmin and Manager. Every non-deleted existing administrator receives a SystemAdmin assignment; existing blocking remains effective. |
| Assign SiteAdmin | The account has administration access within the assigned site, subject to the General settings restriction and installation-only boundaries. |
| Assign Manager | The site inherits editorial permissions for Pages, Chunks, Snippets, Files, and URLs until a site administrator saves a site-specific policy. |
| Assign a role for limited blogger work | Grants for a dedicated search endpoint and blogger creation allow those endpoints within the granted site and scopes. Calls to ungranted detail, update, and cluster endpoints are refused. This example does not require machine authentication in 0.16.0. |

The [MongoDB design](30-design.md) specifies the record shapes, references and
consistency rules. The [administration contract](../../../arch/admin-authorization.md)
describes the existing defaults and object scopes.

## Follow-up on the Access workspace

The Access heading sits closer to its own tabs than to the Settings navigation
on narrow and wide screens.
At widths of 576 px and up, the role label sits beside the selector and
aligns with the action buttons. At narrower widths it sits above the selector.

### Built-in administrator groups

Global is installation-wide and includes System Admin assignments. Site
includes Site Admin assignments for the selected site. Both groups are
read-only and their membership follows the corresponding role assignment.
The combined 0.16.0 migration seeds the groups and their whole-action grants.
Both administrators require an active registered action and a matching grant
within the assignment boundary.

The existing administrator creation script accepts `--site-id` for an
existing site and creates a SiteAdmin assignment for that site. Invoking it
without arguments still creates SystemAdmin. A missing site leaves no new
account, and creating a SiteAdmin leaves installation setup for the first
SystemAdmin.

The site Access workspace shows four tabs and keeps Refresh on the right. System Admin and Site Admin permissions can be inspected. Their built-in policies cannot be edited or removed. Manager starts with editorial actions for Pages, Chunks, Snippets, Files, and URLs. A site can customize this policy, including removing every grant.

The [virtual-folder action](interface-access-resolutions.md) names the selected
URL and is visible only with the catalog, draft creation and materialization actions.

An existing page opened through `cms.pages.read` shows a positioning hint when
the user has `cms.pages.set-position` without `cms.pages.list`. The role editor
explains the missing list permission and its relevant scope next to the granted
position action. List access enables the tree, and the position grant enables
dragging there. An ordinary draft update can still save the page's numeric order.

An editor with draft read and update can save an existing page without page
publication options. The editor explains how to access the missing settings.
The authorized site publication result can supply public availability, and
published Markdown and JSON-LD use their own permissions.

An existing draft that a publisher can read can be published without draft
write access. The editor shows a separate action when saved publication
settings are ready. It names a missing settings grant, address, or template
when the publisher cannot proceed. An uncertain result calls for reloading
and checking publication before retrying.

Site publication options and the URLs catalog display the metadata their
site-wide grants authorize. Scoped page grants still govern opening an existing
draft. The role editor flags both site-wide grants when the role also has a
page grant limited to Own or Groups.

Page TV definitions and values remain visible with list and page-read TV
grants, including when page publication options are unavailable. Without the
TV save grant, fields are read-only, and the editor can save its other fields.

A JSON-LD catalog reader can follow an assigned profile from a readable page or
template and inspect its definition. Changing the profile or its assignments
requires JSON-LD save permission. The profile view explains the missing grant.

An Open Graph editor without file list access can see the saved image address
and edit the other draft metadata. The editor explains the list grant. The
image chooser and inline preview only request private bytes when content read
is granted.

Markdown and JSON-LD page output actions remain contextual in the page editor.
A role with one of those actions and no draft read grant receives guidance in
role settings. Reading a preview and reading the JSON-LD catalog are separate.

Template, chunk and snippet writers can save drafts. A completed draft save
explains how to get the changes applied when site publication is unavailable.
Save & apply requires source write and site publication and describes its
effect on the entire site.

Source preview requires generation access, read access to the generated
document and a readable page using the source. The source editor offers only
eligible pages and explains a missing document grant or page context.

The source usage list links to readable pages, templates and chunks. Other
names already available from the lookup remain visible with read access guidance.

The Files section explains the list permission to users with upload or folder
creation access. Both operations require the version from an authorized list,
including at the root. Role settings show the dependency on the granted action.

File metadata remains available to library readers. The card explains the
missing reference review specifically for the actor's move or delete grants.
In the workspace, reference review precedes move, rename and deletion.

File rename and move show existing and proposed addresses for known usages.
The confirmation and role settings explain the effect on drafts and the active
site. Only readable usage targets have editor links. Saved historical versions
retain their addresses.

The file list and details show metadata and type icons with list access. The
details explain the missing content permission. Private previews, originals
and variants become available when content read is granted.

URLs explains missing catalog access before opening a card. Without URL search,
authorized editors can change a page path with its saved parent and the status
of an existing redirect with its saved destination. Both current values remain
visible and the controls explain access for choosing a new value.

The URL catalog keeps the linked page summary visible with list access. The
card explains draft read when access is missing and opens the editor only after
checking the page's current scope.

An authorized URL writer can save routing changes without the separate apply
action. Confirm successful activation. If a saved route is waiting for activation,
explain who can apply it. The routing publisher applies the saved state without
submitting the original edit again.

Main site settings remain readable without write access and explain how to
request editing. The separate rebuild action explains that it uses saved
settings. Saving a changed public origin explains who can refresh the sitemap
when the current user cannot rebuild the site.

A Hook author can create a disabled handler draft from the workspace or a site
hook card. Creation alone works without the hooks catalog. The form and role
explain when subscription access is missing. An authorized subscriber can attach
an existing handler. When both actions are available, the hook card can create
and attach in one flow. If attachment fails after creation, the saved draft
remains available for separate attachment.

An add-on screen without an Action binding stays out of site navigation. In
Add-ons, a site administrator sees a configuration hint and can open the
connected component through its existing Settings entry. A delegated user who
can read the catalog keeps that access. An unbound screen opened by URL tells
them to contact a site administrator. The server restricts the component
manifest and assets to the administrator in this state.

System Admin can create accounts with any built-in role or a custom role belonging to the selected site. The account and its initial assignment save together. Site Admin can manage permissions and groups within its assigned site.

A permission edited in one domain updates every copy. A short anchored message names the other domains, replaces older messages immediately, and disappears on Escape or fades after three seconds. For delegated users, each workspace and control is tied to its owning action. Page creation can be used without the page tree. Multi-action and multi-domain decisions awaiting owner review are listed in [the interface checklist](interface-access-decisions.md).

## Dump access and process scheduling

- Site Admin can create, upload and restore a full archive of an assigned site.
  The site routes reject installation archives. Partial and installation
  operations require System Admin.
- System Admin creates an installation archive from the Dumps tab. An
  installation restore validates its format and package compatibility before
  replacing CMS-managed data for every site. Sessions are revoked on success.
- Both create routes use the selected site's process pool. With one serving
  process, capture uses the same process even when CPU capacity is available.
  With two or more, the supervisor temporarily lends one process from that
  pool and restores it when capture finishes.
- Global is visible only to System Admin. Site Admin sees the Site group and
  cannot change Global or assign it to content.
