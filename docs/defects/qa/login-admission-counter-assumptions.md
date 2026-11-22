# Login counter integration exceeded its own admission budget

- ID: `qa/login-admission-counter-assumptions`.
- Kind: confirmed bug. Status: fixed.
- Discovered: 2026-11-18. Affected: reproduced from baseline
  `36677c776efa24dad8e846b56d839fe4b1b0d524` (0.15.1 checkout);
  earlier affected range unknown. Fix target: branch/release `0.15.2`, not published.
- Read when changing: QA, login, concurrency, counters, admission.

## Failure and correction

The real auth integration expected nine 401 responses and one counter-limit 429 from ten simultaneous HTTP logins; admission allowed only two password operations, so most requests never reached the counter.

Cause: The test conflated process-local in-flight admission and the persisted ten-failure budget.

Correction and durable guarantee: Send five concurrent pairs. Retain real concurrent counter writes, ten recorded failures, Retry-After and logical pause-expiry checks.

Error/recovery outcome: QA-only correction; no user-facing behavior or admission limit changes. Excess real HTTP work still receives the existing 429 recovery interval.

## Regression and prevention

[Auth integration](../../../test/integration/admin-auth.integration.spec.ts): `counts parallel failures without lost updates, returns Retry-After and expires the pause logically`.

Executed evidence: Initial three-file auth/users integration run: this assertion failed. Its corrected focused rerun passed; final auth/users integration batch passed. Tests use synthetic data and controlled dependencies;
real MongoDB evidence uses a private temporary replica set on Windows.
See the [dated verification log](../../changes/0.15.2/admin-and-pages-qa/50-verification.md)
for final selected runs and limits.

Owning prevention/contract: [Authentication admission and counters](../../arch/admin-authentication.md). The existing rule was not enforced by
the previous fixture/boundary assertion; this record supplies a permanent regression
rather than duplicating the rule. [Bounded audit](../../audits/0.15.2-admin-auth-users-pages.md).
