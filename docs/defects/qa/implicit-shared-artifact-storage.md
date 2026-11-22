# Integration fixtures isolated MongoDB but reused shared artifact storage

- ID: `qa/implicit-shared-artifact-storage`.
- Kind: confirmed bug. Status: fixed.
- Discovered: 2026-11-18. Affected: reproduced from baseline
  `36677c776efa24dad8e846b56d839fe4b1b0d524` (0.15.1 checkout);
  earlier affected range unknown. Fix target: branch/release `0.15.2`, not published.
- Read when changing: QA, fixture-isolation, filesystem, site-ownership, hooks.

## Failure and correction

A repeated hook integration failed with 'Asset directory belongs to another site': a new random database reused the previous filesystem site's directory.

Cause: The fixture supplied only dumpsRoot and let sources/artifacts use default shared storage. Core and site-editing composition had the equivalent omission.

Correction and durable guarantee: Give each run a private temporary root with sibling dump/source/artifact directories as needed; pass roots to every application context, including restart/negative contexts; guard cleanup. In publication tests stop the independently tested background hook loop before source writes, retaining real hook persistence.

Error/recovery outcome: QA-only: isolate and remove only test-owned resources. Never repair an ownership collision by deleting shared/site data or relaxing production ownership checks.

## Regression and prevention

[Hook integration](../../../test/integration/hook-core-operations.integration.spec.ts): `denies before page insertion and executes a permitted command with a source-atomic receipt`; selected [core](../../../test/integration/core.integration.spec.ts) and [archive](../../../test/integration/site-editing.integration.spec.ts) regressions.

Executed evidence: The repeated hook run reproduced the foreign-owner directory conflict. Private-root hook reruns and selected core/archive checks pass; unrelated existing artifacts were not recursively removed. Tests use synthetic data and controlled dependencies;
real MongoDB evidence uses a private temporary replica set on Windows.
See the [dated verification log](../../changes/0.15.2/admin-and-pages-qa/50-verification.md)
for final selected runs and limits.

Owning prevention/contract: [Test dependency and filesystem isolation](../../cms-development/testing-policy.md#isolation-and-execution). The existing rule was not enforced by
the previous fixture/boundary assertion; this record supplies a permanent regression
rather than duplicating the rule. [Bounded audit](../../audits/0.15.2-admin-auth-users-pages.md).
