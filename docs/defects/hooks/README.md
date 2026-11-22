# Hooks defect index

Read matching mechanisms only, following the [lookup route](../README.md).

| Record | Guarantee and triggers | Regression |
| --- | --- | --- |
| [hooks/worker-result-abandoned-queries](worker-result-abandoned-queries.md) | A result waits for owned worker/query cleanup; tags: granted queries, worker finish, cancellation, late failure | [Real Worker regression](../../../test/adapters/hook-runtime.spec.ts) |
| [hooks/abort-runtime-failure-hidden](abort-runtime-failure-hidden.md) | Preserve fatal abort failure before replay; tags: transaction, MongoRuntimeError, retry, cleanup | [Transaction regression](../../../test/adapters/hook-transaction.spec.ts) |
| [hooks/numbered-element-write-contention](numbered-element-write-contention.md) | Independent numbered creations share authorization and hook write guards; tags: rendering, concurrent creation, aborted transaction | [HTTP regression](../../../test/integration/rendering-elements.integration.spec.ts) |
| [hooks/incomplete-atomic-reorder](incomplete-atomic-reorder.md) | reorder, complete-binding-set, transaction-snapshot, concurrent-subscription | [Adapter regression](../../../test/adapters/hook-configuration-order.spec.ts) |
| [hooks/known-rejection-blocked-safe-skip](known-rejection-blocked-safe-skip.md) | command-outcome, rejected, no-effects, safe-skip, receipt-state | [Adapter regression](../../../test/adapters/hook-command-outcomes.spec.ts) |
| [hooks/attachment-editor-navigation](attachment-editor-navigation.md) | Successful attachment opens its saved subscription after the workspace unlocks; tags: admin route, busy guard, attachment | [Playwright regression](../../../test/integration/admin-users-http.integration.spec.ts) |
