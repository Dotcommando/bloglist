# ADR 0018: Page translation groups and single-language editor behavior

Date: 2026-10-26

Status: Accepted by the owner for the translation-group model and editor visibility.

## Decision

Keep a separate Page per content language and connect equivalent pages using
nullable `translationGroupId`. Single-language sites remain a special case of
multilingual sites. This relationship is independent of the optional SEO cluster.

Hide the translation-group field and translation-management panel in the page
editor when the owning site has only one enabled language
(`site.languages.length === 1`). Do not render hidden controls into the keyboard
or accessibility tree. Determine visibility from enabled site languages, not
from the number of translations already created: a multilingual site with only
one existing variant still needs controls for creating/linking its translations.

Hiding controls is presentation behavior only. It must not clear or rewrite a
stored group ID, change page language/content or mutate any translation links.
The existing page-language field is outside this visibility rule. Interface
language selection remains independent under ADR 0017.

## Scope

This records the approved model and UI requirement. It does not implement the
field, migrations or translation workflows. Exact new operation contracts and
remaining routing/publication policies in the
[multilingual site proposal](../arch/multilingual-sites-proposal.md) still require
agreement before their implementation.
