# publication/retained-favicon-rejected

Kind: confirmed bug. Status: fixed. Discovered: 2026-11-18.
Affected: reproduced on 0.15.2; earlier range not established. Fix: 0.15.3.
Tags: incremental-publication, routing-publication, Request-plan, favicon,
asset-classification, partial-save. Read when retaining/rebasing compiled assets.

A valid CMS-managed `/favicon.ico?v=<sha256>` link in an existing Request plan
prevented publishing another page or changing routes. The builders required every
script/link URL to identify a public release artifact, although the favicon is a
separate site-owned endpoint. Draft, page-version and URL writes can already have
completed before this build failure; the old active release remains available.

Correction: reuse `isSiteFaviconLink` to preserve only the exact supported icon
link. Keep CSS/JS public-manifest membership and foreign/private-asset rejection.
Do not broadly exempt link elements or infer a favicon from `rel` alone.

Regression: [page builder](../../../test/adapters/page-release-build.spec.ts),
`retains the valid site favicon while rebasing frozen Request assets` and forged
favicon cases; [routing builder](../../../test/adapters/routing-release-build.spec.ts),
`retains the site favicon while updating frozen Request catalogs and asset links`.
Both valid-link cases executed RED before correction. Real HTTP coverage is in
[admin publication](../../../test/integration/admin-publication.integration.spec.ts).

Recovery: fix the builder and reconcile saved/public state before an explicit
retry. Do not rename a valid page URL, delete the favicon or republish unrelated
drafts to bypass the bug. No automatic publication retry or rollback is added.

[Contract](../../arch/rendering-and-publication.md),
[evidence](../../changes/0.15.3/page-publication-failure/50-verification.md).
