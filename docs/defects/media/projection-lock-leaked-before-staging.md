# Failed staging creation stranded a media writer lock

- ID: `media/projection-lock-leaked-before-staging`.
- Kind: confirmed bug. Status: fixed; executed regression and bounded review checks passed.
- Discovered: 2026-11-18. Affected baseline: `b5edf6842469155a08e767d94fb66f5f64fdf59f`
  (0.15.1 metadata); earlier range unknown. Fix target: 0.15.2, unpublished.
- Read for: stage-creation, ENOSPC, resource-lifetime, writer-lock, cleanup.

## Symptom and correction

An ENOSPC failure creating the stage directory left an empty writer.lock and open handle. Future reconciliation saw an incomplete/live lock and could not complete even after the staging fault was removed.

Cause: Directory creation occurred after opening the writer handle but before entering its try/finally. Sequential cleanup could also skip handle/lock release if stage removal rejected.

Correction and guarantee: Check the unique stage path before taking the handle and create it inside the owned lifetime. Observe stage removal and handle close with allSettled, then unlink the lock. Preserve one failure or aggregate multiple causes; bounded native removal retries cover transient Windows locks.

Error/recovery: The pending media update remains visibly incomplete. After the storage fault clears, the existing reconciliation retry succeeds. Code removes its own lock; no person is instructed to manipulate a JS handle or remove this failed operation's empty lock.

## Executed regression and prevention

[Projection adapter](../../../test/adapters/file-library-projection.spec.ts): `releases the projection lock when staging cannot be created and allows reconciliation retry`; `preserves staging and cleanup failures while releasing the writer for a later retry`.

RED found the empty lock file after injected actual mkdir ENOSPC. GREEN proves lock removal, preserved primary/secondary failures and successful real installation on retry. The unit closes any baseline leaked handle during fixture teardown; it does not rely on garbage collection. Evidence is from Windows with synthetic inputs and owned temporary
storage; no production site was modified. Final scoped runs/limits are maintained
in the [verification log](../../changes/0.15.2/installation-jsonld-media-publication-qa/50-verification.md).

Owning contract/rule: [current guarantee](../../arch/streamed-file-io.md). The regression enforces
that existing guarantee; no copied global checklist or invented security severity.
