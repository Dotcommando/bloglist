# URLs persistence

This module stores permanent public URLs and their state history.

A `Url` is an independent persistent entity. Once created, its path and parent URL do not change. Moving a page to another address creates another `Url`, while the previous URL can become a redirect.

## `urls`

Fields:

- `_id` — MongoDB internal `ObjectId`.
- `mark` — immutable human-readable identifier used in references such as `[[urlWoodTurners]]`. Globally unique and case-insensitive.
- `siteId` — site this URL belongs to.
- `parentUrlId` — immutable optional parent URL used to represent URL hierarchy.
- `segment` — final path segment of this URL.
- `path` — immutable full site-relative URL path, for example `/en/woodturning/`.
- `kind` — current URL behavior: `PAGE` or `REDIRECT`.
- `pageId` — page served by this URL when `kind = PAGE`.
- `redirectTargetUrlId` — destination URL when `kind = REDIRECT`.
- `redirectStatus` — permanent redirect status: `301` or `308`.
- `firstPublishedAt` — time this URL first became public.
- `createdAt`, `updatedAt` — managed automatically by Mongoose.

Important rules:

- `mark`, `parentUrlId`, and `path` do not change after creation.
- `(siteId, path)` is unique.
- One page may have only one current URL with `kind = PAGE`.
- URL hierarchy is independent from cluster hierarchy.
- Changing a published address creates a new `Url`; the previous URL remains as its own persistent entity.

## `url_history`

Stores previous states of a URL.

Fields:

- `_id` — MongoDB internal `ObjectId`.
- `urlId` — URL whose previous state is recorded.
- `kind` — historical URL behavior: `PAGE` or `REDIRECT`. Uses the shared `UrlKind` enum from `url.schema.ts`.
- `pageId` — page served when the historical state referenced a page.
- `redirectTargetUrlId` — redirect destination when the historical state referenced another URL.
- `redirectStatus` — historical permanent redirect status. Uses the shared `UrlRedirectStatus` enum from `url.schema.ts`.
- `createdAt` — time this history record was created.

Important rules:

- `url_history` has no `mark`; history records are not directly referenced by users.
- Site ownership is inherited from the referenced URL.
- History records are append-only snapshots of previous URL state.
- URL and URL history use the same enums for URL kind and redirect status.
