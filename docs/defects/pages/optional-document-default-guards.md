# Optional document defaults rejected by captured-state guards

- ID: `pages/optional-document-default-guards`.
- Kind: confirmed bug. Status: fixed.
- Discovered: 2026-11-18. Affected: reproduced from baseline
  `36677c776efa24dad8e846b56d839fe4b1b0d524` (0.15.1 checkout);
  earlier affected range unknown. Fix target: branch/release `0.15.2`, not published.
- Read when changing: archive, move, captured-state, optional-fields, MIME.

## Failure and correction

A page admitted by current MongoDB validators, with absent mimeType/excludeFromSitemap, reads as text/html/false but cannot be archived or moved: PageConflictError is returned despite no competing edit.

Cause: Archive and tree adapters compared the normalized domain snapshot directly with stored fields. Absence is not MongoDB equality with the explicit default.

Correction and durable guarantee: Both adapters now reuse pageCapture, as repository/publication already do. Only documented default-equivalent values match; a genuine title change still conflicts. No migration or obsolete-version fallback was added.

Error/recovery outcome: Successful archive/move returns the saved page. A real conflicting edit retains the existing conflict outcome: reload current state before deciding on another edit. No operator resource-cleanup action is introduced.

## Regression and prevention

[Adapter archive](../../../test/adapters/page-archival.spec.ts), [adapter tree](../../../test/adapters/page-tree-store.spec.ts), [real MongoDB regression](../../../test/integration/page-snapshot-defaults.integration.spec.ts): `allows %s when persisted optional MIME fields are absent and still rejects an actual concurrent edit` (archive/move).

Executed evidence: Both real-Mongo cases and both adapter filter assertions failed before the correction; the same cases passed afterward. The real check also changes the title and proves stale state is rejected. Tests use synthetic data and controlled dependencies;
real MongoDB evidence uses a private temporary replica set on Windows.
See the [dated verification log](../../changes/0.15.2/admin-and-pages-qa/50-verification.md)
for final selected runs and limits.

Owning prevention/contract: [Document defaults and captured-state guarantee](../../arch/document-mime-and-crawler-files.md). The existing rule was not enforced by
the previous fixture/boundary assertion; this record supplies a permanent regression
rather than duplicating the rule. [Bounded audit](../../audits/0.15.2-admin-auth-users-pages.md).
