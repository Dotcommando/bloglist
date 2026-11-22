# Publication fixtures read the former site-mark artifact directory

- ID: `qa/publication-artifact-directory`.
- Kind: confirmed bug. Status: fixed.
- Discovered: 2026-11-18. Affected: reproduced from baseline
  `36677c776efa24dad8e846b56d839fe4b1b0d524` (0.15.1 checkout);
  earlier affected range unknown. Fix target: branch/release `0.15.2`, not published.
- Read when changing: QA, publication, artifact-path, primary-domain.

## Failure and correction

Publication tests tried to read artifacts/sites/demo while the real current release was stored under artifacts/sites/example.test.

Cause: Test-only filesystem expectations used an obsolete mark-based directory convention.

Correction and durable guarantee: Use the fixture's registered primary-domain directory in all five affected reads; retain checks of actual HTML, private plans, lost-acknowledgement behavior and static export.

Error/recovery outcome: QA-only: no compatibility directory or fallback is added to production. A release must still contain the expected immutable artifacts.

## Regression and prevention

[Publication integration](../../../test/integration/publication.integration.spec.ts), including `builds actual static artifacts, activates them and resolves only the active release` and `serves the static export and its compiled interactions after the Nest application is closed`.

Executed evidence: Real publication run failed with missing files at the old directory; the corrected eleven-scenario file passes, including actual browser export interaction. Tests use synthetic data and controlled dependencies;
real MongoDB evidence uses a private temporary replica set on Windows.
See the [dated verification log](../../changes/0.15.2/admin-and-pages-qa/50-verification.md)
for final selected runs and limits.

Owning prevention/contract: [Publication layout contract](../../arch/rendering-and-publication.md). The existing rule was not enforced by
the previous fixture/boundary assertion; this record supplies a permanent regression
rather than duplicating the rule. [Bounded audit](../../audits/0.15.2-admin-auth-users-pages.md).
