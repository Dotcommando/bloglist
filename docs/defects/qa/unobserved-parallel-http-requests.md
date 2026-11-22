# Concurrent HTTP test left sibling request rejections unobserved

- ID: `qa/unobserved-parallel-http-requests`.
- Kind: confirmed bug. Status: fixed.
- Discovered: 2026-11-18. Affected: reproduced from baseline
  `36677c776efa24dad8e846b56d839fe4b1b0d524` (0.15.1 checkout);
  earlier affected range unknown. Fix target: branch/release `0.15.2`, not published.
- Read when changing: QA, HTTP, Promise, failure-cleanup, concurrent-test.

## Failure and correction

When loopback requests failed while the test waited for an admission gate, two request Promises rejected unobserved and work could outlive the failed assertion.

Cause: Request Promises were only awaited after the gate assertion; failure skipped those awaits.

Correction and durable guarantee: Observe both requests immediately with allSettled, release the gate in finally, await all results and aggregate assertion/request failures outside finally.

Error/recovery outcome: QA-only: report the actual setup/request failure and close owned work. Network permission errors are environment failures, not vulnerabilities or production admission failures.

## Regression and prevention

[HTTP adapter regression](../../../test/adapters/admin-users-http.spec.ts): `bounds concurrent password work without queueing and releases admission after completion`.

Executed evidence: Restricted loopback reproduction reported EACCES plus two unhandled rejections. After the fixture correction the same restriction still fails normally with its network error, without unhandled rejections. Normal loopback reruns pass, including the final 54-file run. Tests use synthetic data and controlled dependencies;
real MongoDB evidence uses a private temporary replica set on Windows.
See the [dated verification log](../../changes/0.15.2/admin-and-pages-qa/50-verification.md)
for final selected runs and limits.

Owning prevention/contract: [Observe sibling Promises and cleanup](../../cms-development/testing-policy.md#required-scenario-selection). The existing rule was not enforced by
the previous fixture/boundary assertion; this record supplies a permanent regression
rather than duplicating the rule. [Bounded audit](../../audits/0.15.2-admin-auth-users-pages.md).
