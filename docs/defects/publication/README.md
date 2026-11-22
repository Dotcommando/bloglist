# Publication defect index

Read matching mechanisms only; use the linked record and regression on demand.

| Record | Guarantee and triggers | Regression |
| --- | --- | --- |
| [publication/retained-favicon-rejected](retained-favicon-rejected.md) | Supported site favicon must survive retained Request asset rebasing; tags: incremental/routing publication, asset identity | [Page/routing regressions](../../../test/adapters/page-release-build.spec.ts) |
| [publication/admin-favicon-source-missing](admin-favicon-source-missing.md) | Session publication must include the configured icon like local publication; tags: composition, favicon source | [Real HTTP publication](../../../test/integration/admin-publication.integration.spec.ts) |
| [publication/deployment-payloads-buffered](deployment-payloads-buffered.md) | Public export payloads use bounded streamed I/O and retained metadata; tags: PrepareSiteDeployment, Cloudflare-preparation, memory, CSP | [Streaming regression](../../../test/adapters/cloudflare-deployment-streaming.spec.ts) |
| [publication/preview-startup-rejection-retained](preview-startup-rejection-retained.md) | A failed loopback preview start poisoned later preview attempts; tags: private-preview, listen, startup, retry, owned-listener | [Owning regression](../../../test/adapters/local-preview-recovery.spec.ts) |
| [publication/authored-assets-buffered-in-build](authored-assets-buffered-in-build.md) | Authored binary assets were buffered by the frontend builder; tags: frontend-build, local-assets, memory, streaming, checksums | [Owning regression](../../../test/adapters/frontend-asset-lifetime.spec.ts) |
| [publication/asset-work-started-before-html-validation](asset-work-started-before-html-validation.md) | HTML validation could abandon already-started asset reads; tags: frontend-build, HTML-validation, Promise-ownership, asynchronous-failure | [Owning regression](../../../test/adapters/frontend-asset-lifetime.spec.ts) |
| [publication/public-staging-preparation-leak](public-staging-preparation-leak.md) | Failed public-directory preparation left a release staging tree; tags: release-staging, ENOSPC, temporary-directory, failure-cleanup | [Owning checks](../../../test/adapters/publication-store.spec.ts) |
