# Bloglist actions

The inventory uses Bloglist runtime `0.4.5` from `zarya-addon-bloglist` at
revision `8f30f8c`. The catalog has 20 actions. Routes were checked against
`src/infra/runtime.ts`, the creator, cluster and selection REST controllers, and
`artifacts/bloglist-0.4.5/addon.runtime.json` with its packaged
`server/runtime.cjs`. This inventory describes the inspected artifact.

The JSON array contains candidate documents for the `actions` collection in CMS
0.16.0. Each object is one HTTP method and route template. MongoDB can generate
`_id`; role grants refer to the stable `actionId`. The booleans describe business
effects and are independent of grants. See [ADR 0091](../../../adr/0091-endpoint-actions-and-site-access.md).

Every action requires the administrative boundary of a single site. The current
blogger name search is a query on `GET /api/admin/sites/:siteId/bloglist/bloggers`;
that action includes the existing administrative list and its field projection.
A dedicated limited-field search for agents would be a new endpoint.

Public collection queries run through `cms.extensions.bloglist`. The current
runtime exposes no public HTTP endpoint of its own.

```json
[
  {
    "actionId": "bloglist.bloggers.list",
    "method": "GET",
    "route": "/api/admin/sites/:siteId/bloglist/bloggers",
    "scope": "site",
    "admission": "admin",
    "shortDescription": "List and search bloggers",
    "description": "Returns a bounded page of site bloggers with a total and child-blog presence. Search matches literal name terms. The administrative result can include contact information and private notes.",
    "domains": ["bloglist.bloggers","bloglist.blogs"],
    "create": false,
    "read": true,
    "update": false,
    "delete": false,
    "execute": false
  },
  {
    "actionId": "bloglist.bloggers.create",
    "method": "POST",
    "route": "/api/admin/sites/:siteId/bloglist/bloggers",
    "scope": "site",
    "admission": "admin",
    "shortDescription": "Create a blogger",
    "description": "Creates a blogger on the selected site with the supplied identity, profile and optional contact or private notes. An idempotency key protects creation replay.",
    "domains": ["bloglist.bloggers"],
    "create": true,
    "read": false,
    "update": false,
    "delete": false,
    "execute": false
  },
  {
    "actionId": "bloglist.bloggers.read",
    "method": "GET",
    "route": "/api/admin/sites/:siteId/bloglist/bloggers/:bloggerId",
    "scope": "site",
    "admission": "admin",
    "shortDescription": "Read a blogger",
    "description": "Returns the identified site blogger's administrative details, including private contact information, notes and the edit version.",
    "domains": ["bloglist.bloggers"],
    "create": false,
    "read": true,
    "update": false,
    "delete": false,
    "execute": false
  },
  {
    "actionId": "bloglist.bloggers.update",
    "method": "POST",
    "route": "/api/admin/sites/:siteId/bloglist/bloggers/:bloggerId",
    "scope": "site",
    "admission": "admin",
    "shortDescription": "Update a blogger",
    "description": "Replaces the editable fields of the identified site blogger under an expected-version check, including optional private contact and notes.",
    "domains": ["bloglist.bloggers"],
    "create": false,
    "read": false,
    "update": true,
    "delete": false,
    "execute": false
  },
  {
    "actionId": "bloglist.blogs.list",
    "method": "GET",
    "route": "/api/admin/sites/:siteId/bloglist/blogs",
    "scope": "site",
    "admission": "admin",
    "shortDescription": "List and search blogs",
    "description": "Returns a bounded page of blogs on the site, optionally restricted to a blogger. Supports literal name search and returns the matching total.",
    "domains": ["bloglist.blogs","bloglist.bloggers"],
    "create": false,
    "read": true,
    "update": false,
    "delete": false,
    "execute": false
  },
  {
    "actionId": "bloglist.blogs.create",
    "method": "POST",
    "route": "/api/admin/sites/:siteId/bloglist/blogs",
    "scope": "site",
    "admission": "admin",
    "shortDescription": "Create a blog",
    "description": "Creates a blog for an existing same-site blogger with its URL and editable metadata. An idempotency key protects creation replay.",
    "domains": ["bloglist.blogs","bloglist.bloggers"],
    "create": true,
    "read": false,
    "update": false,
    "delete": false,
    "execute": false
  },
  {
    "actionId": "bloglist.blogs.read",
    "method": "GET",
    "route": "/api/admin/sites/:siteId/bloglist/blogs/:blogId",
    "scope": "site",
    "admission": "admin",
    "shortDescription": "Read a blog",
    "description": "Returns the identified site's blog, its blogger relationship, editable metadata and the current edit version.",
    "domains": ["bloglist.blogs","bloglist.bloggers"],
    "create": false,
    "read": true,
    "update": false,
    "delete": false,
    "execute": false
  },
  {
    "actionId": "bloglist.blogs.update",
    "method": "POST",
    "route": "/api/admin/sites/:siteId/bloglist/blogs/:blogId",
    "scope": "site",
    "admission": "admin",
    "shortDescription": "Update a blog",
    "description": "Replaces a blog's editable fields, including its same-site blogger relationship, under an expected-version check.",
    "domains": ["bloglist.blogs","bloglist.bloggers"],
    "create": false,
    "read": false,
    "update": true,
    "delete": false,
    "execute": false
  },
  {
    "actionId": "bloglist.blogs.list-platforms",
    "method": "GET",
    "route": "/api/admin/sites/:siteId/bloglist/blogs/platforms",
    "scope": "site",
    "admission": "admin",
    "shortDescription": "List blog platforms",
    "description": "Returns the supported platform codes used by the administrative blog editor.",
    "domains": ["bloglist.blogs"],
    "create": false,
    "read": true,
    "update": false,
    "delete": false,
    "execute": false
  },
  {
    "actionId": "bloglist.clusters.list",
    "method": "GET",
    "route": "/api/admin/sites/:siteId/bloglist/clusters",
    "scope": "site",
    "admission": "admin",
    "shortDescription": "List and search clusters",
    "description": "Browses the site's root or child clusters with bounded paging. A search with literal name terms returns matching clusters across the site.",
    "domains": ["bloglist.clusters"],
    "create": false,
    "read": true,
    "update": false,
    "delete": false,
    "execute": false
  },
  {
    "actionId": "bloglist.clusters.create",
    "method": "POST",
    "route": "/api/admin/sites/:siteId/bloglist/clusters",
    "scope": "site",
    "admission": "admin",
    "shortDescription": "Create a cluster",
    "description": "Creates a site cluster at the root or below a same-site parent, with a name, Markdown description and optional initial primary query. An idempotency key protects creation replay.",
    "domains": ["bloglist.clusters","bloglist.cluster-queries"],
    "create": true,
    "read": false,
    "update": false,
    "delete": false,
    "execute": false
  },
  {
    "actionId": "bloglist.clusters.read",
    "method": "GET",
    "route": "/api/admin/sites/:siteId/bloglist/clusters/:clusterId",
    "scope": "site",
    "admission": "admin",
    "shortDescription": "Read a cluster",
    "description": "Returns one site cluster's metadata, parent and primary-query information with its edit version.",
    "domains": ["bloglist.clusters","bloglist.cluster-queries"],
    "create": false,
    "read": true,
    "update": false,
    "delete": false,
    "execute": false
  },
  {
    "actionId": "bloglist.clusters.update",
    "method": "POST",
    "route": "/api/admin/sites/:siteId/bloglist/clusters/:clusterId",
    "scope": "site",
    "admission": "admin",
    "shortDescription": "Update a cluster",
    "description": "Updates the cluster name and Markdown description under an expected-version check. The submitted primary query must match the current value. Dedicated query actions manage the query catalog.",
    "domains": ["bloglist.clusters","bloglist.cluster-queries"],
    "create": false,
    "read": false,
    "update": true,
    "delete": false,
    "execute": false
  },
  {
    "actionId": "bloglist.cluster-queries.list",
    "method": "GET",
    "route": "/api/admin/sites/:siteId/bloglist/clusters/:clusterId/queries",
    "scope": "site",
    "admission": "admin",
    "shortDescription": "List cluster queries",
    "description": "Returns a bounded page of the cluster's saved queries and the information needed to identify its primary query.",
    "domains": ["bloglist.clusters","bloglist.cluster-queries"],
    "create": false,
    "read": true,
    "update": false,
    "delete": false,
    "execute": false
  },
  {
    "actionId": "bloglist.cluster-queries.create",
    "method": "POST",
    "route": "/api/admin/sites/:siteId/bloglist/clusters/:clusterId/queries",
    "scope": "site",
    "admission": "admin",
    "shortDescription": "Add a cluster query",
    "description": "Adds a distinct search query to the cluster using its expected version. Primary-query selection follows the cluster's existing rules.",
    "domains": ["bloglist.clusters","bloglist.cluster-queries"],
    "create": true,
    "read": false,
    "update": false,
    "delete": false,
    "execute": false
  },
  {
    "actionId": "bloglist.cluster-queries.update",
    "method": "POST",
    "route": "/api/admin/sites/:siteId/bloglist/clusters/:clusterId/queries/:queryId/edit",
    "scope": "site",
    "admission": "admin",
    "shortDescription": "Edit a cluster query",
    "description": "Changes the text of one saved query under the cluster's version check. If the query is primary, its summary is updated with it.",
    "domains": ["bloglist.clusters","bloglist.cluster-queries"],
    "create": false,
    "read": false,
    "update": true,
    "delete": false,
    "execute": false
  },
  {
    "actionId": "bloglist.cluster-queries.remove",
    "method": "POST",
    "route": "/api/admin/sites/:siteId/bloglist/clusters/:clusterId/queries/:queryId/remove",
    "scope": "site",
    "admission": "admin",
    "shortDescription": "Remove a cluster query",
    "description": "Removes the identified query under the cluster's version check and updates the primary-query selection if that query was primary.",
    "domains": ["bloglist.clusters","bloglist.cluster-queries"],
    "create": false,
    "read": false,
    "update": false,
    "delete": true,
    "execute": false
  },
  {
    "actionId": "bloglist.cluster-queries.select-primary",
    "method": "POST",
    "route": "/api/admin/sites/:siteId/bloglist/clusters/:clusterId/primary-query",
    "scope": "site",
    "admission": "admin",
    "shortDescription": "Select the primary cluster query",
    "description": "Assigns a saved query as the cluster's primary query or clears the selection. Uses the cluster's expected version.",
    "domains": ["bloglist.clusters","bloglist.cluster-queries"],
    "create": false,
    "read": false,
    "update": true,
    "delete": false,
    "execute": false
  },
  {
    "actionId": "bloglist.cluster-memberships.list",
    "method": "GET",
    "route": "/api/admin/sites/:siteId/bloglist/clusters/:clusterId/blogs",
    "scope": "site",
    "admission": "admin",
    "shortDescription": "List blogs selected for a cluster",
    "description": "Returns a bounded page of selected blogs in membership order, with public card fields and the cluster edit version.",
    "domains": ["bloglist.clusters","bloglist.blogs"],
    "create": false,
    "read": true,
    "update": false,
    "delete": false,
    "execute": false
  },
  {
    "actionId": "bloglist.cluster-memberships.change",
    "method": "POST",
    "route": "/api/admin/sites/:siteId/bloglist/clusters/:clusterId/blogs",
    "scope": "site",
    "admission": "admin",
    "shortDescription": "Change the blogs selected for a cluster",
    "description": "Adds or removes a blog membership, or moves it up or down in the saved order. The action covers all four commands within the allowed scope. Removing a membership retains the blog itself.",
    "domains": ["bloglist.clusters","bloglist.blogs"],
    "create": true,
    "read": false,
    "update": true,
    "delete": true,
    "execute": false
  }
]
```
