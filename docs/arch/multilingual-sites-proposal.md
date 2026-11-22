# Multilingual sites: proposal for review

Date: 2026-10-26

Status: Partially accepted. The owner approved `translationGroupId` and hiding
translation controls for single-language sites in
[ADR 0018](../adr/0018-page-translation-groups.md). These are not implemented yet;
the remaining operation contracts and policies below are proposals for review.

## Existing behavior and gaps

Site already stores `languages[]` and `defaultLanguage`; Page already stores
one immutable `language`. CreatePage validates it against the owning site.
UpdateSite supports adding/removing languages; removal fails while any page
uses the language, including archived pages. Creation and removal share the
site content guard (ADR 0015). Single-language sites are already a special case.
See [site editing](site-editing-and-url-behavior.md),
[use-case contracts](scenario-001-use-cases.md) and [site workspace](admin-frontend.md).

The initial site form creates a one-element language array. The page editor
already offers every language returned in `site.languages`. There is no
translation-equivalence relationship or generated alternate-link metadata.
`clusterId` is an optional language-specific SEO relationship and must not be
repurposed for translations. Public rendering already exposes `[[*language]]`
and passes page language into loaders; a global `[[++locale]]` is not the
authority for the language of all pages.

## Content representation

| Option | Effects | Assessment |
| --- | --- | --- |
| One Page per language, linked by a shared translation group | Retains page identity, independent content/SEO/rendering, URLs and three publication versions per language | Recommended; extends existing contracts |
| One Page with a translations map | Reworks Page, draft/publication/restore contracts and concurrent edits across languages | Larger rewrite with little benefit for the current engine |
| Separate translation-group collection with member references | Useful if groups later own common data, permissions or workflow | Unnecessary extra aggregate for simple equivalence today |

The accepted model uses independent pages with optional `translationGroupId`. All
languages are peers: no mandatory source page, automatic copying, or requirement
that every site language exist in a group. Title, H1, Markdown, metadata, template
parameters, draft and publication belong to each page. Shared templates/assets
can still be reused. A singleton or ungrouped page is valid. Existing globally
unique page marks remain unchanged; use AboutEn and AboutRu, for example.

Illustrative database records (other current fields omitted):

```json
{
  "_id": "site-example",
  "languages": ["en", "ru"],
  "defaultLanguage": "en"
}
```

```json
[
  {
    "_id": "page-about-en",
    "siteId": "site-example",
    "language": "en",
    "translationGroupId": "translation-about",
    "title": "About us",
    "contentMd": "English content"
  },
  {
    "_id": "page-about-ru",
    "siteId": "site-example",
    "language": "ru",
    "translationGroupId": "translation-about",
    "title": "О нас",
    "contentMd": "Русский текст"
  }
]
```

Site needs no new multilingual fields for en/ru. Pages gain nullable
`translationGroupId`; add a unique partial index on
`(siteId, translationGroupId, language)` for string group IDs only. Null/absent
groups must not restrict unrelated pages in the same language. Keep current
page/URL uniqueness and tenant isolation. Do not store reciprocal page-ID arrays
in each page: query group members through an explicit pages-owned port.

Link/create/unlink operations need agreed new contracts. Proposed inputs identify
the trusted site, source/target page or target language and editorial fields;
outputs return saved page/group membership. Reject foreign pages, disabled
languages, duplicate group languages, unexpected existing memberships and
concurrent membership changes. Joining a page already in another group fails
instead of silently merging groups. Change all affected members atomically
through a pages-owned transactional port and database uniqueness, with no
cross-capability repository access. Removing a translation does not delete its
other languages. Archiving/unpublishing changes public visibility only when a
release activates under existing publication rules.

For existing installations, use one explicit migration to allow/backfill null
group IDs and create the partial index; do not infer relationships from titles,
marks or URL similarity. No content copying, URL changes or release activation
is part of that migration. Older retained page versions without the field remain
readable. RestorePageVersion preserves current group membership just as it
preserves language/identity; it does not restore old translation relationships.
Capture current membership separately into the release snapshot so linking a
translation need not republish unchanged page content or rewrite retained versions.

## Language codes and routing

The existing contract accepts two lowercase letters. Keep en/ru compatible.
Before regional/script variants are required, agree a dedicated extension to
canonical BCP 47 tags, such as en-GB and zh-Hant, consistently across site/page
validation, MongoDB validators, filters, dictionaries and publication. Do not
lowercase all subtags or retain a two-letter pattern after that change. HTML
supports BCP 47; search annotations have a narrower supported language policy.
See [MDN language tags](https://developer.mozilla.org/en-US/docs/Glossary/BCP_47_language_tag)
and [Google localized versions](https://developers.google.com/search/docs/specialty/international/localized-versions).

Recommend distinct URLs with language prefixes for new multilingual sites:
`/en/about/` and `/ru/o-nas/`. Routing still owns URL entities referencing the
individual page IDs; prefixes are explicit path-allocation policy, not page
identity or request-time language inference. Preserve existing URLs unless an
explicit URL change is requested. The root can have an explicit redirect to the
default-language home. Changing the default does not silently rewrite existing
URLs or page languages. Language-specific domains can be added later through
validated domain mappings if needed.

Direct URLs always select their own language. Do not vary the same public URL
by the administration preference or Accept-Language. A public language switcher
links to the equivalent page, not a guessed slug. Missing translation means no
alternate link; show an unavailable language as disabled or omit it. Do not
silently serve English under a Russian URL or redirect a missing article
translation to an unrelated home page. Site default chooses new-page defaults
and an explicitly configured root destination; it does not require a
default-language translation of every page.

## Backend, templates and browser responsibilities

At PublishSiteRelease, capture one coherent view of published page versions,
current group membership, site languages, registered origin and URL bindings.
Build a language map before rendering any page. Include only actual document
routes in the selected release; omit drafts, redirects, missing URLs and
non-indexable pages from SEO alternates. Keep a separate navigation list if
publicly accessible noindex pages should appear in the visitor switcher.

Add a typed, immutable i18n render context with current language, canonical URL,
available translated pages and localized template messages. Define its contract
before implementation. Language comes from the captured Page, with reserved
context fields protected against template-parameter shadowing. Configure a
validated absolute `publicOrigin` in trusted site configuration, consistent with
the registered domain, and freeze it into the release. Never derive these URLs
from unchecked Host/forwarded headers. Explicit local HTTP origins support testing.

The page owner authors actual translations. Site-owned dictionaries provide
template/chunk strings such as menu, footer and booking-button text by the same
page language. Capture them as build values; fail on missing required keys
instead of silently showing English UI on another language's page. Domain data
loaders receive that language through their existing contexts and return their
explicitly localized view models.

The backend resolves/validates relationships and public URLs. Templates own
document markup: `<html lang>`, title/description, canonical and alternate links.
A reusable declared head chunk emits links from the prepared context; a
navigation chunk uses the same available translations. Neither queries storage
or invents relationships. Use existing placeholder/Each/chunk syntax rather
than executable snippets.

For the English page, the intended output is:

```html
<html lang="en">
  <head>
    <link rel="canonical" href="https://example.com/en/about/">
    <link rel="alternate" hreflang="en" href="https://example.com/en/about/">
    <link rel="alternate" hreflang="ru" href="https://example.com/ru/o-nas/">
  </head>
</html>
```

The Russian page has `lang="ru"`, its own canonical and the same reciprocal
alternate set including itself. These are `<link>` elements, not `<meta>` tags.
Only add x-default when an explicit valid fallback destination is configured;
an unrelated home page is not every article's translation. See
[HTML alternates](https://developers.google.com/search/docs/specialty/international/localized-versions)
and [same-language canonicals](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls).

Static HTML includes metadata before browser code runs. Request pages store
the same frozen map/messages with compiled plans and use the selected release,
without reading draft membership or recompiling on GET. A new release updates
all affected pages' links together. Build failure leaves the old release intact.
Caches include site, release, page/language and relevant input. Browser code
receives only public language/messages and navigable links. REST APIs keep stable
machine-readable error codes; the frontend translates their presentation.
UI language does not select time zones or alter UTC instants/date-only values.

## Administration UX and future verification

Replace the single site-language field with enabled languages plus a separate
default selected from them. Initialize with en only; enabling a language does
not create content. Expose existing UpdateSite safely before promising language
editing in the UI. Show language badges/filter and a translation panel in the
page editor: an existing-page link/status or Create translation for each enabled
language, optionally linking an independently created page. Missing translations
are valid. Distinguish draft and published availability. The administration's
own en/ru preference remains independent.

Under ADR 0018, hide the translation-group field and translation-management panel
when `site.languages.length === 1`. Omit them from the rendered editor, including
keyboard and accessibility navigation. This rule concerns translation controls;
it does not change the existing page-language field. For sites with several
enabled languages, show translation controls even when no other translation
exists yet. Visibility follows site configuration, not the current interface
language or the number of existing translations. Hiding must not clear stored
group membership or trigger a save.

Agree input/output/failure contracts and an accepted ADR before coding this
proposal's remaining policies. Cover multilingual/singleton sites, missing
translations, language and cross-site conflicts, concurrent group edits, independent drafts/publication/
restore, localized messages, reciprocal alternates, URL changes/redirects,
noindex handling and a failed/atomic release. Static and Request pages must
expose the same frozen map without client-side SEO or unpublished content leakage.
Verify that single-language editors omit translation controls, multilingual
editors offer them with only one existing variant, and visibility changes retain
group membership and unsaved editorial input without issuing a mutation.
