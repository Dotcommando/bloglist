# Page fixtures assumed new sites contained no system documents

- ID: `qa/system-document-fixture-assumptions`.
- Kind: confirmed bug. Status: fixed.
- Discovered: 2026-11-18. Affected: reproduced from baseline
  `36677c776efa24dad8e846b56d839fe4b1b0d524` (0.15.1 checkout);
  earlier affected range unknown. Fix target: branch/release `0.15.2`, not published.
- Read when changing: QA, site-setup, system-documents, page-numbers, initial-release.

## Failure and correction

Publication, hook, core and archive tests failed on legitimate system pages/publications: totals 3/4 instead of 0/1, first captured page was not the authored page, page numbers began at 4, and first ordinary activation had an existing active release.

Cause: Assertions retained pre-system-document setup assumptions despite the current three-page and initial-release contract.

Correction and durable guarantee: Scope preservation/count assertions to the authored page or explicit marks; select snapshots by pageId; expect ordinary numbers 4 onward/root order 400 onward; obtain the actual expected active release. Retain cycle, stale-write, rollback and content-preservation checks.

Error/recovery outcome: QA-only: system documents remain enabled in real composition. Do not hide fixture drift by disabling the product's site setup or deleting meaningful integration scenarios.

## Regression and prevention

The 0.16.0 administration release selection also reproduced this known mechanism
in the Pagination fixture (`expectedActiveReleaseId: null`) and URL sitemap
expectations. Obtain the actual initial release and expect the current system
sitemap document even before a public origin is configured. See
[current evidence](../../changes/0.16.0/admin-site-journeys/50-verification.md).

[Publication](../../../test/integration/publication.integration.spec.ts), [hooks](../../../test/integration/hook-core-operations.integration.spec.ts), [core](../../../test/integration/core.integration.spec.ts) (`allocates immutable page numbers, sibling orders and preserves content on moving`), [archive](../../../test/integration/site-editing.integration.spec.ts) (`archives only the page state and preserves its content and publication metadata`).

Executed evidence: Actual integration assertions failed on counts, snapshot selection and 4/5/6/7 versus 1/2/3/4; archive count was 4 versus 1. Corrected selected scenarios pass with real setup still enabled. Tests use synthetic data and controlled dependencies;
real MongoDB evidence uses a private temporary replica set on Windows.
See the [dated verification log](../../changes/0.15.2/admin-and-pages-qa/50-verification.md)
for final selected runs and limits.

Owning prevention/contract: [Current new-site setup](../../arch/document-mime-and-crawler-files.md#new-site-setup). The existing rule was not enforced by
the previous fixture/boundary assertion; this record supplies a permanent regression
rather than duplicating the rule. [Bounded audit](../../audits/0.15.2-admin-auth-users-pages.md).
