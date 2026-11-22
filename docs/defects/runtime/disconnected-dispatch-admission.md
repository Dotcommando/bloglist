# Disconnected dispatch leaked a process admission

- ID: `runtime/disconnected-dispatch-admission`.
- Kind: confirmed bug; no security exploit is asserted by the source audit.
- Status: fixed according to historical evidence; not re-executed in this
  documentation change.
- Affected/fixed release: corrected in CMS 0.15.0; the earliest affected version
  and exact fixing revision are not established by the source audit.
- Record date: 2026-11-18.
- Read for: awaited session/routing dispatch, HTTP admissions, disconnects,
  site/administration pools, drain and shutdown.

## Symptom, cause and prevention

A browser closed while the coordinator awaited authentication or site routing.
Dispatch later acquired a process lease and registered finish/close listeners
after close had already occurred. The lease remained active and worker drain
waited until its deadline. Both site and administration pools shared the mechanism.

The correction checks request abortion and destroyed/completed responses before
admission, then acquires/registers listeners synchronously. Normal completion and
synchronous setup failure still release exactly once. The durable guarantee is
that no consumer disappearance can strand admission after asynchronous preparation;
adding a longer timeout or swallowing shutdown errors does not repair ownership.

The disconnected browser needs no notification. The explicit operation outcome is
aborted dispatch without an acquired lease; worker/operator shutdown can complete
normally. Actual shutdown failures remain failures. No new UI recovery flow was
introduced by the historical correction.

## Regression and evidence

- [HTTP regression](../../../test/adapters/process-request-admission.spec.ts): hold
  async dispatch, close the response, resume dispatch; before the fix an admission
  leaked, after it no admission is acquired. Related cases check normal completion
  and synchronous setup failure.
- [Shutdown integration](../../../test/integration/fork-shutdown.integration.spec.ts):
  actual browser/coordinator/native-worker cleanup; the audit reports failure at
  the drain deadline before the fix and successful cleanup after it.
- Exact test-title filters must be confirmed from these files before execution.
  This record imports the [shutdown audit](../../audits/0.15.0-worker-shutdown.md);
  its historical Windows/browser/MongoDB evidence is not a new verification run.

Current prevention requirements: [async ownership](../../cms-development/feature-design.md#asynchronous-ownership-and-cleanup),
[error outcomes](../../cms-development/feature-design.md#error-outcomes-and-recovery)
and [publication/failure boundaries](../../arch/fork-publication-and-failure-tests.md).
No remediation dossier was present in that historical audit; this record adds
discoverability without reconstructing missing history.
