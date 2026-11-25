# Administration interaction defects

Read only matching interactions and failure mechanisms.

| Record | Guarantee and triggers | Regression |
| --- | --- | --- |
| [admin/media-browser-refresh-shift](media-browser-refresh-shift.md) | Updates must preserve media results and show the shared spinner within the visible results. | [Browser regression](../../../test/integration/file-library.integration.spec.ts) |
| [admin/media-browser-control-alignment](media-browser-control-alignment.md) | Shared controls and centered pagination for Files and pickers. | [Browser regression](../../../test/integration/file-library.integration.spec.ts) |
| [admin/installation-dump-form-layout](installation-dump-form-layout.md) | Installation archive actions use two responsive cards and the shared file chooser. | [Browser regression](../../../test/integration/admin-users-http.integration.spec.ts) |
| [admin/account-action-target-size](account-action-target-size.md) | Account actions require a 44 px target in narrow and wide layouts; tags: account editor, responsive, target size | [Browser regression](../../../test/integration/admin-users-ui.integration.spec.ts) |
| [admin/mobile-draft-validation-focus](mobile-draft-validation-focus.md) | Mobile More menu must release focus to an invalid page field; tags: draft-save, native-validation, popover | [Browser regression](../../../test/integration/admin-rendering-ui.integration.spec.ts) |
| [admin/file-organization-draft-reset](file-organization-draft-reset.md) | Independent File name/Folder saves must preserve the other input; tags: rename, move, pending-input | [Real Files UI](../../../test/integration/file-library.integration.spec.ts) |
| [admin/template-variables-deep-link-missing](template-variables-deep-link-missing.md) | TV workspace direct navigation/reload must serve the shell; tags: client/server routes, HTTP 404 | [HTTP regression](../../../test/adapters/admin-document-http.spec.ts) |
| [admin/new-page-partial-publication-state](new-page-partial-publication-state.md) | New-page publication failure must reconcile assigned/public URL state without replay; tags: partial save, availability | [Browser regression](../../../test/integration/admin-rendering-ui.integration.spec.ts) |
| [admin/build-info-inline-action-style](build-info-inline-action-style.md) | Same-screen version action retains shared dotted/hover styling; tags: text-action, affordance, summary-to-button, header | [Browser regression](../../../test/integration/cms-build-info.integration.spec.ts) |
| [admin/build-info-not-dismissed](build-info-not-dismissed.md) | Version overlay closes on outside click/Escape; tags: popover, keyboard, focus, header, build-provenance | [Browser regression](../../../test/integration/cms-build-info.integration.spec.ts) |
| [admin/array-item-parameter-kind-lost](array-item-parameter-kind-lost.md) | Array item type/default replacement must reach the parent binding; tags: recursive parameters, function binding | [Browser regression](../../../test/integration/admin-rendering-ui.integration.spec.ts) |
| [admin/tv-default-label-collision](tv-default-label-collision.md) | TV default section and media controls must have distinct IDs and correct accessible names; tags: Image, File, aria-labelledby | [Browser regression](../../../test/integration/template-variables-ui.integration.spec.ts) |
| [admin/transliteration-table-alignment](transliteration-table-alignment.md) | Language controls align and hints preserve centered inputs in compact responsive rule columns | [Browser regression](../../../test/integration/admin-users-ui.integration.spec.ts) |
| [admin/access-heading-spacing](access-heading-spacing.md) | The Access heading sits closer to its tabs than to the Settings submenu | [Browser regression](../../../test/integration/admin-users-ui.integration.spec.ts) |
| [admin/refresh-glyph-legibility](refresh-glyph-legibility.md) | Refresh arrows remain clear and centered in the shared button; tags: icon, refresh, stroke | [Browser regression](../../../test/integration/addon-card-ui.integration.spec.ts) |
| [admin/addon-page-system-role-dropped](addon-page-system-role-dropped.md) | Add-on page summaries preserve the system document role; tags: add-on workspace, page choice | [Browser regression](../../../test/integration/addon-card-ui.integration.spec.ts) |
