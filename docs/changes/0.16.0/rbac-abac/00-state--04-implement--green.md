# Endpoint action authorization

Kind: feature. Target CMS release and current branch: `0.16.0`.
Baseline: `f63d9c5`, clean working tree before this documentation change.

The owner approved recording the endpoint action and site access model in the
project. The [architecture decision](../../../adr/0091-endpoint-actions-and-site-access.md)
records the agreed model. See [observable behavior](10-behavior.md) and
[the current authority boundaries](20-existing-behavior.md).

The [MongoDB design](30-design.md) specifies the proposed authorization storage
and the [decision log](60-decisions.md) records open details. The
[add-on development guide](../../../addon-development/README.md) owns packaging, code,
testing and planned authorization guidance. See [verification](50-verification.md).

The current route inventory is recorded as candidate `actions` collection
documents in [CMS](actions-cms.md), [Events](actions-events.md), and
[Bloglist](actions-bloglist.md). The site and installation boundaries are
recorded in the ADR. Core package metadata is `0.15.3` and both inspected add-on
runtime artifacts are `0.4.5`.

Documentation verification matched 237 unique method and route pairs against
the source-derived inventory and checked the JSON shape, CRUDE booleans,
manifest route prefixes, both packaged server checksums, and 30 relative links
and anchors. The catalog records the inspected artifacts. Runtime selection
and authorization behavior require verification during implementation.

The owner authorized implementation on 2026-11-19. See [verification cases](40-cases.md).
The migration and the initial role enforcement pass on an isolated MongoDB
replica set. The built-in CMS catalog, account creation with a role, site
boundary and installation General restriction are wired. The site access editor
manages Manager grants, custom roles, access groups and content assignments.
Migration 0016 and the content adapters wire Own and Groups for the supported
page, chunk and snippet actions. Build and package validation recognize
versioned add-on authorization metadata. Registration tied to the serving
add-on runtime remains open.

The Access interface follow-up is implemented and verified in the local
0.16.0 preview. Migration 0017 preserves explicit Manager policies, including
an empty one. See [verification](50-verification.md) for the focused results
and the [interface checklist](interface-access-decisions.md) for effects
requiring an owner decision. Serving add-on declarations remain separate work.

## Draft creation and URL permissions

The working tree builds on `8923ed3` and includes the
[agreed interface behavior](interface-access-resolutions.md). Migration
`0015-rbac-and-transliteration` combines the pre-release RBAC migrations and adds
site transliteration settings. The draft and its
server-assigned URL commit together. See URL-DRAFT-01 through URL-DRAFT-08 in
[the verification cases](40-cases.md) and the [results](50-verification.md).

The virtual-folder link follow-up on clean `5cf14ea` implements the
[approved decision](interface-access-resolutions.md). URL-DRAFT-09/10 passed
in Playwright, including a real draft save. The
[verification entry](50-verification.md#virtual-folder-page-creation-link)
records the checks. Serving add-on declaration registration remains open in
the parent authorization feature.

## Sequential interface recommendations

The owner approved implementation of the [21 interface recommendations](interface-access-resolutions.md#рекомендации-по-21-сценарию-для-0160)
one at a time, with tests. The sequence starts on clean `f59800a` in `0.16.0`.
Item 1, page positioning without list access, is verified in the working tree.
See [ACCESS-01A–ACCESS-01C evidence](50-verification.md#interface-recommendation-1-page-positioning).
Item 2, draft editing without publication options, is verified in the working
tree. See [ACCESS-02A–ACCESS-02C evidence](50-verification.md#interface-recommendation-2-draft-editing-without-publication-options).
Item 3, publication of a saved draft without edit access, is verified in the
working tree. See [ACCESS-03A–ACCESS-03C evidence](50-verification.md#interface-recommendation-3-publish-a-saved-draft).
Item 4, site-wide metadata with scoped page rights, is verified in the working
tree. See [ACCESS-04A–ACCESS-04C evidence](50-verification.md#interface-recommendation-4-site-wide-metadata).
Item 5, reading page TV values without saving them, is verified in the working
tree. See [ACCESS-05A–ACCESS-05C evidence](50-verification.md#interface-recommendation-5-read-page-tv-values).
Item 6, read-only JSON-LD profiles, is verified in the working tree. See
[ACCESS-06A–ACCESS-06B evidence](50-verification.md#interface-recommendation-6-read-json-ld-profiles).
Item 7, Open Graph images without file listing, is verified in the working tree.
See [ACCESS-07A–ACCESS-07B evidence](50-verification.md#interface-recommendation-7-open-graph-image-access).
Item 8, contextual Markdown and JSON-LD page previews, is verified in the
working tree. See [ACCESS-08A–ACCESS-08B evidence](50-verification.md#interface-recommendation-8-contextual-page-previews).
Item 9, saving rendering sources without site publication, is verified in the
working tree. See [ACCESS-09A–ACCESS-09C evidence](50-verification.md#interface-recommendation-9-save-rendering-source-drafts).
Item 10, choosing an authorized context for rendering previews, is verified in
the working tree. See [ACCESS-10A–ACCESS-10B evidence](50-verification.md#interface-recommendation-10-rendering-preview-context).
Item 11, access-aware links from source usages, is verified in the working tree.
See [ACCESS-11A–ACCESS-11B evidence](50-verification.md#interface-recommendation-11-source-usage-links).
Item 12, file upload and folder creation without file listing, is verified in
the working tree. See [ACCESS-12A–ACCESS-12B evidence](50-verification.md#interface-recommendation-12-file-writes-without-list).
Item 13, file changes without reference review, is verified in the working tree.
See [ACCESS-13A–ACCESS-13B evidence](50-verification.md#interface-recommendation-13-file-reference-review).
Item 14, explaining file moves that update references, is verified in the
working tree. See [ACCESS-14A–ACCESS-14B evidence](50-verification.md#interface-recommendation-14-file-move-effects).
Item 15, reading file metadata without access to private content, is verified
in the working tree. See [ACCESS-15A–ACCESS-15B evidence](50-verification.md#interface-recommendation-15-file-content-access).
Item 16, editing URL routes with separate list and search access, is verified
in the working tree. See [ACCESS-16A–ACCESS-16B evidence](50-verification.md#interface-recommendation-16-url-catalog-and-search).
Item 17, linked page metadata without draft read, is verified in the working
tree. See [ACCESS-17 evidence](50-verification.md#interface-recommendation-17-url-linked-page).
Item 18, applying saved routes with separate publication access, is verified
in the working tree. See [ACCESS-18A–ACCESS-18B evidence](50-verification.md#interface-recommendation-18-routing-publication).
Item 19, saved settings and site publication as independent actions, is
verified in the working tree. See [ACCESS-19A–ACCESS-19B evidence](50-verification.md#interface-recommendation-19-settings-and-site-rebuild).
Item 20, independent Hook handler creation and subscription, is verified in the
working tree. See [ACCESS-20A–ACCESS-20B evidence](50-verification.md#interface-recommendation-20-hook-handlers-and-subscriptions).
Item 21 is partially implemented. The unbound-screen path is verified in the
working tree. Delegated access to explicitly bound screens and controls still
depends on activation-time Action registration, host enforcement and the
add-on's UI bindings. See [ACCESS-21A–ACCESS-21B evidence](50-verification.md#interface-recommendation-21-add-on-ui-access).
