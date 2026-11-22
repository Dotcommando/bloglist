# Admission fixture failed in optional telemetry before reaching authorization

- ID: `qa/optional-telemetry-admission-fixture`.
- Kind: confirmed bug. Status: fixed.
- Discovered: 2026-11-18. Affected: reproduced from baseline
  `36677c776efa24dad8e846b56d839fe4b1b0d524` (0.15.1 checkout);
  earlier affected range unknown. Fix target: branch/release `0.15.2`, not published.
- Read when changing: QA, dispatcher, authentication-before-body, optional-telemetry.

## Failure and correction

Fifteen early-auth endpoint tests failed on a missing telemetry arrive method before reaching their intended real dispatcher guard.

Cause: The synthetic application's broad provider stub did not implement unrelated optional page diagnostics.

Correction and durable guarantee: Explicitly disable optional pageDiagnostics in this auth fixture. Keep the real dispatcher/auth gate, unfinished request bodies and assertions of no body consumption/operation.

Error/recovery outcome: QA-only: fail on the security behavior under test rather than unrelated instrumentation. No production telemetry or authorization behavior was changed.

## Regression and prevention

[Early-auth dispatcher regressions](../../../test/infra/admin-request-admission.spec.ts): all 15 endpoint-family cases.

Executed evidence: All fifteen failed before correction; focused rerun and final 54-file run passed. Auth was not stubbed to an unconditional success and security assertions were retained. Tests use synthetic data and controlled dependencies;
real MongoDB evidence uses a private temporary replica set on Windows.
See the [dated verification log](../../changes/0.15.2/admin-and-pages-qa/50-verification.md)
for final selected runs and limits.

Owning prevention/contract: [Authenticate before spending resources](../../cms-development/security-verification.md#authenticate-before-spending-resources). The existing rule was not enforced by
the previous fixture/boundary assertion; this record supplies a permanent regression
rather than duplicating the rule. [Bounded audit](../../audits/0.15.2-admin-auth-users-pages.md).
