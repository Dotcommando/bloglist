# ADR 0023: Creation-time URL suggestions and editable page metadata

Date: 2026-10-27

Status: Accepted by the owner's request to implement title-based slug suggestions
and expose SEO/Open Graph fields now, while discussing URL-change UX separately.

The administration editor suggests a lowercase Latin URL path from a new page's
title. English punctuation/whitespace becomes a single hyphen; Russian letters
use the explicit [transliteration table](../arch/page-seo-and-slugs.md). Manual
path input stops automatic suggestions. The first home page retains `/`.
Opening an existing page and changing its title never changes its URL, including
an existing draft with no URL. Immutable page marks remain separate from paths.

The owner's 2026-10-28 clarification extends new-form suggestions: always prefill
the site-root `/` or selected parent's assigned URL prefix, and append automatic
title slugs within it. Empty/unsupported titles retain that prefix. Parent
selection updates automatic suggestions while preserving manual path input.

Preserve ADR 0019's publication boundary: URL settings apply when publishing;
draft saving changes page content/metadata without assigning or changing routing.
Do not add redirect decisions or URL-change UI in this change.

Expose the existing h1, metaTitle, metaDescription and robotsIndex page fields.
Add nullable ogTitle, ogDescription, ogImage and ogType to page drafts, retained
publications, restoration and frozen Request plans. The image is an absolute
HTTP(S) URL without credentials; no image download happens while saving/rendering.
The supported OG types are website/article, with website as the rendering default.
An omitted field preserves its value on update; null clears it. Existing
snapshots without OG fields normalize them to null.

Migration 0015 expands the explicit pages/page_publications validators without
rewriting old snapshots or changing indexes. Apply it before using the updated
backend. Publication still exposes only retained published values, never drafts.

Templates own document metadata. Expose raw fields and a prepared `seo` view
model to both Static and Request composition. ZaryaBasic uses that view model,
omits empty optional description/image tags, and escapes text/attributes. Custom
templates opt into these fields; do not rewrite their saved sources or active
releases. Rendering fallback rules and field references are documented alongside
the transliteration table.
