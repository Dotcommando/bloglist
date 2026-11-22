# ADR 0017: Independent administration interface languages

Date: 2026-10-26

Status: Accepted by the owner's request for English/Russian administration.

## Decision

Provide English and Russian through a native select at the top right of both
the authentication shell and authenticated workspace. Default to English rather
than the browser language. Persist an explicit choice in the browser under
`zarya.admin.language`; invalid/unavailable storage falls back to English.
Storage failure must not prevent switching during the current visit.

Keep complete, typed dictionaries in the administration application. Translate
headings, labels, accessible names, document title, loading states, notices and
client error messages reactively, including an already displayed error. Update
the document's `lang`. Switching must preserve entered form values, selected
site/page, authentication and in-flight operations. No translation service or
additional runtime dependency is needed for two fixed interface languages.

The administration language is independent of site/page content. Site creation
initially sets `languages: ['en']` and `defaultLanguage: 'en'`; the existing
language field remains editable. Page creation uses the selected site's default,
and existing pages keep their stored language. The first page's suggested title
is Home for English content and Главная for Russian content; leave it empty for
other content languages rather than insert an English title. Switching the
interface never translates or rewrites authored content.

This supersedes ADR 0016's UI-language-based Home suggestion. It introduces no
backend contract, account schema or database migration. Public-site multilingual
content, translation relationships and publication metadata remain a separate
proposal in [multilingual site design](../arch/multilingual-sites-proposal.md).
