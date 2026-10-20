# Sites persistence

This module stores public sites managed by the CMS.

A `Site` is an independent public website. Clusters, pages, and URLs belong to a site, while the global blogger/blog catalog may be shared between sites.

## `sites`

Fields:

- `_id` — MongoDB internal `ObjectId`.
- `mark` — immutable human-readable identifier used in internal references such as `[[siteMakerChannels]]`. Globally unique and case-insensitive.
- `name` — display name used in the back office.
- `primaryDomain` — primary hostname used to publish the site, for example `makerchannels.com`. Store the normalized hostname only, without protocol or path.
- `languages` — list of enabled two-letter language codes, for example `['en', 'de', 'fr']`.
- `defaultLanguage` — default language of the site. Must also be present in `languages`.
- `status` — current site state, such as `ACTIVE` or `ARCHIVED`.
- `createdAt`, `updatedAt` — managed automatically by Mongoose.

Important rules:

- `mark` must never change after creation.
- `primaryDomain` must be normalized before persistence.
- `primaryDomain` must be unique between sites.
- Language codes use two lowercase letters such as `en`, `de`, or `fr`.
- `languages` must not contain duplicate values.
- `defaultLanguage` must always be included in `languages`.
- Clusters, pages, and URLs reference the site by its MongoDB `_id`, not by `mark` or domain.
- Changing the site's domain does not change the stored relative URL paths.