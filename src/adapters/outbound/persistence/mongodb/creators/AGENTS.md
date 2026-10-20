# Bloggers and blogs persistence

This module stores the global creator catalog shared by all sites.

`Blogger` represents a person, team, or brand.

`Blog` represents one concrete publishing/community channel owned by that blogger, such as YouTube, X, Discord, Instagram, or a website.

## `bloggers`

Fields:

- `_id` — MongoDB internal `ObjectId`.
- `mark` — immutable human-readable identifier used in references such as `[[bloggerJohnSmith]]`. Globally unique and case-insensitive.
- `name` — display name of the person, team, or brand.
- `type` — `PERSON`, `TEAM`, or `BRAND`.
- `country` — optional country associated with the blogger.
- `website` — optional primary official website of the blogger.
- `contactEmail` — optional contact email. Stored lowercase.
- `notesMd` — optional internal Markdown notes about the blogger.
- `status` — `ACTIVE` or `INACTIVE`.
- `createdAt`, `updatedAt` — managed automatically by Mongoose.

Important rules:

- `mark` must never change after creation.
- Blogger names are not unique.
- One blogger may own multiple blogs/channels.
- `notesMd` is internal Markdown and is not the public channel description.

## `blogs`

Fields:

- `_id` — MongoDB internal `ObjectId`.
- `mark` — immutable human-readable identifier used in references such as `[[blogJohnsWorkshop]]`. Globally unique and case-insensitive.
- `bloggerId` — owner of this channel.
- `platform` — `YOUTUBE`, `INSTAGRAM`, `TIKTOK`, `X`, `FACEBOOK`, `LINKEDIN`, `DISCORD`, `WEBSITE`, or `OTHER`.
- `name` — display name of the channel.
- `url` — canonical URL of the channel. Must be normalized before persistence.
- `externalId` — optional stable platform-specific identifier, e.g. a YouTube channel ID.
- `handle` — optional platform handle such as `@johnswoodshop`.
- `followers` — latest known follower/subscriber count. This is current data, not metric history.
- `description` — optional channel description. Plain text, not Markdown.
- `lastCheckedAt` — when channel data was last manually or automatically checked.
- `status` — `ACTIVE` or `INACTIVE`.
- `createdAt`, `updatedAt` — managed automatically by Mongoose.

Important rules:

- `mark` must never change after creation.
- A blog belongs to exactly one blogger.
- `(platform, externalId)` uniquely identifies a channel when `externalId` is known.
- Empty `externalId` values should be stored as `null`, not `''`.
- `url` should be normalized before saving.
- `handle` is not considered a stable identity and may change.
- `followers` stores only the latest known value.
- `description` contains source/plain text; use `...Md` only for Markdown fields.