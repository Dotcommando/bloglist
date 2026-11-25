# Batch storage writer contention

ID `media/batch-storage-writer-contention`. Confirmed bug. Fixed in the 0.17.0
candidate on 2026-11-24.

Concurrent valid uploads could cause one item to fail because a sibling held
the local site storage writer lock. The isolated streamed-batch integration
reproduced this as an internal item failure. Lock acquisition now retries
short-lived contention for a bounded interval. Exhausted admission still
returns a failed item and the caller can retry with the same upload key.

[CMS API integration regression](../../../test/integration/cms-api.integration.spec.ts),
scenario “streams a bounded batch with a scoped identity and resumable item
results”. [Files contract](../../arch/site-files.md).
