# Delayed reconciliation replaced a newer acknowledged projection

- ID: `media/stale-reconciler-overwrites-current-output`.
- Kind: confirmed bug. Status: fixed; executed regression and bounded review checks passed.
- Discovered: 2026-11-18. Affected baseline: `b5edf6842469155a08e767d94fb66f5f64fdf59f`
  (0.15.1 metadata); earlier range unknown. Fix target: 0.15.2, unpublished.
- Read for: pending-journal, version-fence, named-output, concurrent-reconciliation.

## Symptom and correction

Two reconcilers captured pending v1. After one completed v1 and a later v2 was committed/installed/acknowledged, the delayed v1 installer replaced the current files. MongoDB still said v2/pending=false. Current public paths could disappear without a remaining recovery marker.

Cause: The pending record was read before acquiring the filesystem writer lock. Serializing writes did not fence an obsolete captured catalog.

Correction and guarantee: The projection accepts a neutral current-version callback, checks it under its existing site writer lock and reports whether output was installed. The store reloads the matching pending journal there and skips obsolete output, garbage removal and acknowledgement. The offline migration checks its captured completed version under the same lock.

Error/recovery: Existing public/UI state remains current; an obsolete reconciler becomes an idempotent no-op. A failed fresh check or install retains the pending journal and propagates; the existing Finish file update action can retry without processing an image again.

## Executed regression and prevention

[Projection adapter](../../../test/adapters/file-library-projection.spec.ts): `leaves current named bytes unchanged when the pending catalog is no longer current`; [real race](../../../test/integration/media-reconciliation-fence.integration.spec.ts): `does not let a delayed reconciler replace a newer acknowledged named-media projection`.

Both RED checks observed current.png disappear (ENOENT); the real race additionally proved MongoDB remained v2/pending=false. Both passed after correction. A deterministic gate pauses the production projection invocation; MongoDB and filesystem operations remain real. Evidence is from Windows with synthetic inputs and owned temporary
storage; no production site was modified. Final scoped runs/limits are maintained
in the [verification log](../../changes/0.15.2/installation-jsonld-media-publication-qa/50-verification.md).

Owning contract/rule: [current guarantee](../../arch/site-files.md#storage-and-recovery). The regression enforces
that existing guarantee; no copied global checklist or invented security severity.
