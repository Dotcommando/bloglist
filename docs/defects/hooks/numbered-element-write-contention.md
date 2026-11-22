# hooks/numbered-element-write-contention

Confirmed bug fixed for CMS 0.16.0. Observed on `51e186e` and
previously reproduced on clean `f59800a`. The earlier affected range is unknown.
Read when changing numbered rendering creation, authorization guards or
hook-aware MongoDB write retries.

Eight concurrent administrator creates for different chunks can return HTTP
409 `StaleWrite` for some requests instead of assigning each a unique key.
The transactions share authorization and hook guards even when their element
keys differ. MongoDB reported write conflict 112 before commit after the
ordinary two retries. The same behavior is reproducible without racing a stale
edit.

Allow up to seven further attempts for the database portion of creation after
a successful abort of a write conflict, reusing the reserved key and prepared
intent. Existing optimistic checks and authority reads still run on each
attempt. Backup acquisition may use the same bounded retry after a confirmed
abort. Running the filesystem callback seals the attempt against automatic
replay, and the backup remains a separate transaction. An exhausted budget
returns the existing conflict or pending-backup outcome. An uncertain commit
still requires reconciliation.

[Adapter regression](../../../test/adapters/element-store.spec.ts)
checks repeated aborts with one fact commit. The
[HTTP regression](../../../test/integration/rendering-elements.integration.spec.ts)
checks all eight acknowledgements, distinct keys and backups alongside the
stale-edit case. See the [rendering contract](../../arch/rendering-element-editing.md)
and [remediation evidence](../../changes/0.16.0/release-gate-failures/50-verification.md).
