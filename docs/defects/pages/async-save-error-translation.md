# Asynchronous page-save errors bypassed adapter translation

- ID: `pages/async-save-error-translation`.
- Kind: confirmed bug. Status: fixed.
- Discovered: 2026-11-18. Affected: reproduced from baseline
  `36677c776efa24dad8e846b56d839fe4b1b0d524` (0.15.1 checkout);
  earlier affected range unknown. Fix target: branch/release `0.15.2`, not published.
- Read when changing: page-save, async-await, provider-error, abstraction-boundary.

## Failure and correction

The existing-page update branch leaked a rejected provider duplicate-key Error rather than the PageConflictError promised by its adapter catch.

Cause: The try block returned persistHookChange's Promise without awaiting it, so asynchronous rejection occurred outside its catch. The old test exercised a locally implemented creation double instead of this branch.

Correction and durable guarantee: Await persistence inside the existing try/catch. Preserve unrelated technical/uncertain-write errors unchanged and never retry a mutation automatically.

Error/recovery outcome: Recognized storage uniqueness errors use the existing domain conflict route. Unknown write outcomes remain technical errors without a blind retry. This is an adapter-contract reproduction with controlled provider rejection, not a demonstrated exploit or a claim of a real production duplicate incident.

## Regression and prevention

[Repository boundary regression](../../../test/adapters/pages.spec.ts): `maps duplicate-key updates and preserves uncertain write outcomes without retry`.

Executed evidence: Executed the rewritten real-repository boundary unit: expected PageConflictError, received raw Error with code 11000. After adding await, it passes together with the uncertain-outcome/no-retry assertion. Tests use synthetic data and controlled dependencies;
real MongoDB evidence uses a private temporary replica set on Windows.
See the [dated verification log](../../changes/0.15.2/admin-and-pages-qa/50-verification.md)
for final selected runs and limits.

Owning prevention/contract: [Adapter error outcomes](../../cms-development/feature-design.md#error-outcomes-and-recovery). The existing rule was not enforced by
the previous fixture/boundary assertion; this record supplies a permanent regression
rather than duplicating the rule. [Bounded audit](../../audits/0.15.2-admin-auth-users-pages.md).
