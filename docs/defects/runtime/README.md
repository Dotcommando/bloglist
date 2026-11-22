# Runtime defect index

Read rows matching the changed mechanism, then open only those records.

| Record | Guarantee and matching triggers | Regression |
| --- | --- | --- |
| [runtime/disconnected-dispatch-admission](disconnected-dispatch-admission.md) | A disconnected request cannot acquire an unreleasable admission after awaited routing/auth; tags: HTTP, async-dispatch, cancellation, site/admin-pools, drain, shutdown | [Deterministic HTTP regression](../../../test/adapters/process-request-admission.spec.ts) |
