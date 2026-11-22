# Composition fixture left an editorial page read bound to MongoDB

- ID: `qa/missing-editorial-outbound-override`.
- Kind: confirmed bug. Status: fixed.
- Discovered: 2026-11-18. Affected: reproduced from baseline
  `36677c776efa24dad8e846b56d839fe4b1b0d524` (0.15.1 checkout);
  earlier affected range unknown. Fix target: branch/release `0.15.2`, not published.
- Read when changing: QA, composition, editorial-options, provider-overrides, buffered-query.

## Failure and correction

The admin-content provider-override test timed out at 5000 ms when publication options performed an editorial page read through an unconnected real MongoDB repository.

Cause: The fixture replaced several dependencies but omitted PAGE_REPOSITORY, newly required by this actual operation path.

Correction and durable guarantee: Bind the existing FakePageRepository at the declared outbound boundary. Retain actual inbound execution and denied-authority assertions; remove a redundant typeof-execute inventory.

Error/recovery outcome: QA-only: this is intentionally an outbound-override composition test, not evidence of MongoDB durability. It must not accidentally wait on an undeclared external service.

## Regression and prevention

[Content composition regression](../../../test/infra/admin-content-module.spec.ts): `binds real use cases with overridden ports and no local-operator authority`.

Executed evidence: The selected composition test timed out before correction, then passed focused and in the final 54-file run. Real MongoDB page coverage remains in integration files. Tests use synthetic data and controlled dependencies;
real MongoDB evidence uses a private temporary replica set on Windows.
See the [dated verification log](../../changes/0.15.2/admin-and-pages-qa/50-verification.md)
for final selected runs and limits.

Owning prevention/contract: [Composition evidence and limits](../../cms-development/testing-policy.md#select-the-level-that-proves-the-guarantee). The existing rule was not enforced by
the previous fixture/boundary assertion; this record supplies a permanent regression
rather than duplicating the rule. [Bounded audit](../../audits/0.15.2-admin-auth-users-pages.md).
