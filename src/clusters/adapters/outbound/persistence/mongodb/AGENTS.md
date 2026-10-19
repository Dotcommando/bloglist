# Clusters persistence

This module contains MongoDB persistence schemas for clusters and the blogs assigned to them.

## `clusters`

Represents one SEO/content cluster inside a site.

A cluster groups pages and blogs around one topic. Cluster hierarchy is editorial only and does not define URL structure.

Fields:

- `_id` — MongoDB `ObjectId`. Internal technical identifier.
- `mark` — stable human-readable identifier, e.g. `WoodTurners`. Used in references such as `[[clusterWoodTurners]]`. Immutable and globally unique.
- `siteId` — owning site.
- `parentClusterId` — optional parent cluster. Used only to organize clusters into a hierarchy. Does not affect URLs.
- `language` — two-letter content language code, e.g. `en`, `de`, `fr`.
- `name` — display name used in the back office.
- `descriptionMd` — optional Markdown description explaining what the cluster covers.
- `industry` — optional industry/category, e.g. `woodworking`.
- `geography` — optional geographic focus, e.g. `UK`. `null` means no specific geography.
- `primaryQuery` — optional main search query associated with the cluster.
- `status` — `ACTIVE` or `ARCHIVED`.
- `createdAt`, `updatedAt` — managed automatically by Mongoose.

Important rules:

- `mark` must never be changed after creation.
- Parent and child clusters must belong to the same site.
- Cluster hierarchy and URL hierarchy are independent.
- `descriptionMd` contains Markdown source, not rendered HTML.

## `cluster_blogs`

Many-to-many relation between a cluster and a blog.

This collection defines which blogs belong to a cluster and how they are displayed inside that cluster.

Fields:

- `_id` — MongoDB `ObjectId`.
- `clusterId` — referenced cluster.
- `blogId` — referenced blog.
- `position` — manual display order inside the cluster. Lower values appear first. Prefer sparse values such as `100`, `200`, `300` so items can be inserted between existing positions.
- `notesMd` — optional Markdown notes specific to this blog's inclusion in this cluster.
- `visible` — whether the blog is currently shown in cluster-based public lists. Setting this to `false` keeps the relation without publishing it.
- `createdAt`, `updatedAt` — managed automatically by Mongoose.

Important rules:

- The same blog can belong to many clusters.
- The same blog can appear only once inside one cluster.
- `position` belongs to the cluster-blog relation, not to the blog itself.
- Site ownership is inherited through `clusterId`; `siteId` must not be duplicated here.
- `notesMd` describes this blog in the context of this cluster and may differ between clusters.