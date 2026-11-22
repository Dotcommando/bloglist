# ADR 0050: Site-scoped readable page keys and system-page filtering

Date: 2026-11-01

Status: Accepted by the owner's request and explicit choice of page-key uniqueness
within each site.

## Context

Page keys currently use globally case-insensitive uniqueness. This prevents two
sites from having their own index, sitemapXml, robotsTxt or llmsTxt keys.
The editor's random Page plus 32 hexadecimal characters is difficult to read.
The three protected crawler documents also occupy space in the Pages drawer.

This decision supersedes global page-mark lookup/uniqueness in the initial
contracts and ADR 0005. It does not change site marks, URL marks, opaque page IDs,
per-site page numbers or publication identities.

## Decision

IPageRepository.findByMark accepts the trusted siteId and mark. CreatePage checks
availability only within that site; the persistence adapter queries both siteId
and normalized markKey. Uniqueness remains case-insensitive and atomic through
the unique (siteId, markKey) index. Languages within one site share this key
namespace. Existing access checks, conflict results and uncertain-write behavior
remain unchanged.

New protected documents use sitemapXml, robotsTxt and llmsTxt respectively.
Dots remain unsupported by the existing page-key grammar. Their URL identities
remain independently generated.

New page forms suggest index for /. Other meaningful URL paths suggest PascalCase
from their last segment with the existing transliteration rules. A leading digit
gains a Page prefix. Missing, unsupported, malformed or locally occupied
suggestions fall back to Page plus eight hexadecimal characters. The fallback is
stable in the unsaved editor buffer. Manual key input stops suggestions; saving
the page makes its key immutable. Concurrency remains guarded by the repository
and index, with an explicit conflict rather than an automatic mutation retry.

Migration 0003-site-scoped-page-marks creates the compound unique index before
retiring pages_mark_unique. Migration manifests declare removedIndexes; apply is
idempotent if retirement completed before a missing receipt, and verification
rejects a reintroduced retired index. Runtime add-on installation cannot use
index retirement to change existing schemas. Applied migration files and their
checksums are preserved.

Existing page keys, IDs, content, retained versions and active releases are not
renamed or rewritten. This preserves existing references. Apply the migration
with the application stopped before starting the updated engine.

The Pages drawer offers Hide system pages directly below its heading and Create
button, in its fixed header. It defaults to false and persists the browser
preference in localStorage. Filtering uses systemDocument, preserves ordinary
documents even with matching filenames, and does not change the current editor,
saved page data or publication. Tree expansion and accessible keyboard focus
survive filtering. Blocked browser storage does not disable the view filter.

## Verification

Focused application and adapter tests cover scoped lookup, case-insensitive
conflicts and readable initial keys. Isolated MongoDB coverage checks upgrades,
unchanged original BSON content, index retirement/recovery/drift, independent
tenant keys and concurrent same-site creation. Browser coverage checks the fixed
filter, persistence, role-based hiding, ordinary lookalike titles, focus,
responsive layout, URL-derived keys and manual overrides.
