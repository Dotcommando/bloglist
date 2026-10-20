# Pages persistence

This module stores page content and publication state.

A `Page` represents one content unit inside a site. Its public URL is stored separately in the `urls` collection.

## `pages`

Fields:

- `_id` — MongoDB internal `ObjectId`.
- `mark` — immutable human-readable identifier used in references such as `[[pageWoodTurners]]`. Globally unique and case-insensitive.
- `siteId` — site that owns the page.
- `clusterId` — optional cluster the page belongs to. Static pages may have no cluster.
- `language` — two-letter content language code such as `en`, `de`, or `fr`.
- `type` — controls how the page is rendered:
    - `STATIC` — content comes primarily from `contentMd`.
    - `BLOG_LIST` — page renders the blogs assigned to its cluster.
    - `MIXED` — Markdown content combined with dynamic blog-list blocks.
- `status` — `DRAFT`, `PUBLISHED`, or `ARCHIVED`.
- `title` — internal/main page title.
- `h1` — optional explicit page H1. If absent, rendering logic may fall back to `title`.
- `metaTitle` — optional SEO title.
- `metaDescription` — optional SEO description.
- `contentMd` — page body stored as Markdown source.
- `robotsIndex` — whether the published page should be indexable by search engines.
- `publishedAt` — date of first publication, or `null` if never published.
- `createdAt`, `updatedAt` — managed automatically by Mongoose.

Important rules:

- `mark` must never change after creation.
- A page belongs to exactly one site.
- A page may belong to zero or one cluster.
- If `clusterId` is present, the page and cluster must belong to the same site and use the same language.
- URL data must not be stored in the page document; URL ownership is handled by the `urls` collection.
- `contentMd` stores Markdown source, not rendered HTML.
- `publishedAt` should be set by the publication use case, not edited directly.
- `robotsIndex` is independent from publication status.
- `BLOG_LIST` pages obtain their blog list through `clusterId -> cluster_blogs`.
- `MIXED` pages may combine Markdown with dynamic blocks such as `{{blogs}}`.