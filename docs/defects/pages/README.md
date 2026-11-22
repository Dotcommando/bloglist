# Pages defect index

Read only the rows matching the changed capability or failure mechanism.

| Record | Guarantee and matching triggers | Regression |
| --- | --- | --- |
| [pages/draft-update-response-read-scope](draft-update-response-read-scope.md) | Draft update responses must honor independent read scope; tags: admin HTTP, authorization, response projection | [HTTP adapter regression](../../../test/adapters/admin-content-http.spec.ts) |
| [pages/optional-document-default-guards](optional-document-default-guards.md) | Optional document defaults rejected by captured-state guards; tags: archive, move, captured-state, optional-fields, MIME | [Primary regression](../../../test/adapters/page-archival.spec.ts) |
| [pages/async-save-error-translation](async-save-error-translation.md) | Asynchronous page-save errors bypassed adapter translation; tags: page-save, async-await, provider-error, abstraction-boundary | [Primary regression](../../../test/adapters/pages.spec.ts) |
