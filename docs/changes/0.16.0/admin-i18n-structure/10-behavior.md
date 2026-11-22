# Administration localization and source layout

The interface selector lists the locales declared by the administration locale
registry. English remains the default. Preserve the stored preference and live
language switching. Preserve authentication, navigation, editor drafts and
the independent site and page content languages.

Keep feature workspaces with their controls, API clients and models. Keep
shared primitives, browser utilities and styling under shared folders.
Place CMS UI translations in locale resources and interpolate dynamic values
when rendering. Language-neutral identifiers retain their literal values.
Add-on supplied and site-owned content follows its own language contract.

The contract and existing browser acceptance tests are documented in
[Administration interface languages](../../../arch/admin-frontend.md#interface-languages).
