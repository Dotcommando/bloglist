# Delivery expectations omitted current document metadata

- ID: `qa/resolved-document-metadata-expectations`.
- Kind: confirmed bug. Status: fixed.
- Discovered: 2026-11-18. Affected: reproduced from baseline
  `36677c776efa24dad8e846b56d839fe4b1b0d524` (0.15.1 checkout);
  earlier affected range unknown. Fix target: branch/release `0.15.2`, not published.
- Read when changing: QA, publication, resolved-path, robotsIndex, markdownPath.

## Failure and correction

Exact object equality rejected correct StoredDocument/RequestPlan outputs containing robotsIndex and the additive markdownPath.

Cause: Fixtures asserted an outdated whole-object representation rather than the current required delivery metadata.

Correction and durable guarantee: Assert required StoredDocument fields including robotsIndex with toMatchObject; retain exact RequestPlan identity and include robotsIndex. Do not weaken private-plan/content checks.

Error/recovery outcome: QA-only: emitted metadata and public indexing behavior remain governed by the current contract; no production serialization change.

## Regression and prevention

[Publication integration](../../../test/integration/publication.integration.spec.ts): stored static document and frozen RequestPlan scenarios.

Executed evidence: Actual resolution returned the additional current fields and failed the prior equality assertions. Corrected file passes all eleven scenarios. Tests use synthetic data and controlled dependencies;
real MongoDB evidence uses a private temporary replica set on Windows.
See the [dated verification log](../../changes/0.15.2/admin-and-pages-qa/50-verification.md)
for final selected runs and limits.

Owning prevention/contract: [Document publication metadata](../../arch/document-mime-and-crawler-files.md#publication-and-sitemap). The existing rule was not enforced by
the previous fixture/boundary assertion; this record supplies a permanent regression
rather than duplicating the rule. [Bounded audit](../../audits/0.15.2-admin-auth-users-pages.md).
