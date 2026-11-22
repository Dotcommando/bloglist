# ADR 0091 — Endpoint actions and site access

Date: 2026-11-18

Status: Accepted model for CMS 0.16.0. See the [current implementation](../arch/admin-authorization.md).

## Context

Active administrator accounts currently have access to every site. Zarya needs
site-scoped roles for managers and a model that can later authorize service
accounts with a narrow set of actions. A single endpoint can have several
business effects, so the administrative permission must cover the endpoint as a
unit. See [administrator authentication](../arch/admin-authentication.md).

## Actions catalog

Every registered HTTP endpoint has an action. An endpoint is the pair of its
HTTP method and registered route template. An action has a stable, namespaced
ID, a short description, a detailed description, one or more action domains,
and `C`, `R`, `U`, `D`, `E` flags for its business effects. The catalog displays
the method, route, descriptions, domains, and flags. Grants refer to the action
ID. Public and infrastructure endpoints retain their own admission rules; the
role editor offers actions that are subject to role authorization.

The flags stand for Create, Read, Update, Delete, and Execute. They describe
the endpoint's supported effects and are display metadata. An internal lookup
or a response confirming a write does not by itself give an action the `R` flag.

For example, the Bloglist endpoint `POST /api/admin/sites/:siteId/bloglist/clusters/:clusterId/blogs`
can carry both the Clusters and Blogs domains and display `C-UD-`. It creates
a blog's membership in a cluster, changes that membership's position, and
removes the membership. These effects concern the cluster's membership records.
Granting the action authorizes all its supported commands within the granted
object scope. Granting only the add command would require a distinct endpoint
and action.

## Action domains and site access groups

An **action domain** describes the business area in which an endpoint operates.
CMS declares core domains such as Pages, Chunks, and Snippets. An add-on declares
its own namespaced domains and actions through the host contract. Bloglist, for
example, can declare Bloggers, Blogs, and Clusters without adding business
registrations to the CMS distribution. An action listed under several domains
still has one ID and one permission entry per role. Adding a domain or assigning
an action to a domain confers no permissions.

A **site access group** represents actors who work together on a site. For
example, an administrator can create an Editorial group, manage its membership,
and assign content to that group. Group membership and object assignment are site
data. Add-on domains organize their actions and do not create memberships or
imply access to objects. See [site add-on contracts](../arch/site-addons-contracts.md).

## Role grants and object scope

The role editor is a separate view from the Actions catalog. It presents
actions by domain and lets an administrator grant an entire action and choose
its applicable object scopes. A grant applies to the same action wherever it
appears. Each scope is evaluated within the current site for site-owned data.

### Site and installation boundaries

The action declares its authority boundary as `site` or `installation`.
A site-scoped role assignment names a specific `siteId`. The same account can
hold different roles on different sites. `All` on a site grant covers that
site's objects. Installation-wide actions include account administration,
installation settings, and shared add-on package management. For example, the
package installation endpoint uses a site as entry context and registers a
runtime for the entire installation.

The installation-wide `admin` role covers every existing and future site.
Console-created administrators receive this role without an individual site
assignment. A site selector for a delegated account exposes only the sites it
can access. See [console account creation](../arch/administration-users.md#creating-an-administrator).

### Object scopes

| Scope | Objects covered |
| --- | --- |
| Own | Objects whose recorded creator is the authenticated actor. |
| Groups | Objects assigned to a site access group in which the actor is currently a member. |
| All | All objects on the authorized site, including objects without a recorded creator or group. |

Own and Groups can be combined. Applicable role grants combine additively.
An action requires an applicable grant, and object access requires a matching
scope. For creation, scope constrains where the object can be created. The
server records the authenticated creator and validates any destination group.
Ownership and group assignment are authorization attributes, so an ordinary
object update cannot change them as a side effect.

The system administrator role has full authority and is protected from editing
and deletion. The last active administrator remains protected, including when
role assignments change. The manager role is a starting point for delegated
access to Pages, Chunks, and Snippets on an assigned site. The eventual manager
grant list must explicitly account for publication and operations that run code.

The server enforces action and object authorization. The role editor and the
catalog flags confer no access by themselves. List and search results and their
counts are scoped before pagination. Composite commands must respect the scope
of the affected objects and their own domain invariants. The same rules are
intended to support future service accounts, such as a Bloglist agent with
separate grants for a limited search and for blogger creation. Machine
credentials are future work.

See the [MongoDB design](../changes/0.16.0/rbac-abac/30-design.md) and
[add-on authorization requirements](../addon-development/authorization.md) for the
planned persistence and package boundaries.
