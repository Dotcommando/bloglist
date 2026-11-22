# A failed delivery-marker removal stranded the operation lock

- ID: `deployment/resolved-marker-failure-stranded-lock`.
- Kind: confirmed bug. Status: fixed; regression and bounded review checks passed.
- Discovered: 2026-11-18. Affected baseline: `318a475b0ffb8c121e8dc6c9efec8e29609b30ba`
  (0.15.1 metadata); earlier range unknown. Fix target: 0.15.2, unpublished.
- Read for: delivery-restore-guard, resolved-marker, cleanup, EACCES, automatic-reconciliation.

On a resolved permit, marker deletion happened before handle/lock release. A failure removing that marker skipped both and blocked the next delivery pass even after the storage fault cleared.

Correction: Observe marker deletion and handle closure independently, then always attempt lock removal. Preserve every failure. Retain the marker if it cannot be removed, so restoration remains blocked until the next successful reconciliation pass.

Outcome/recovery: The failed cycle propagates its technical error. A later executor pass can acquire a permit and clear the retained marker after storage recovery; it does not replay an acknowledged upload. No manual deletion of a live lock is proposed.

## Regression and prevention

[Owning regression](../../../test/adapters/delivery-restore-guard.spec.ts).
Executed RED found .operation.lock after injected marker EACCES. GREEN proves lock absence, retained restore prohibition, a fresh permit and successful marker reconciliation. Five nearby resource/executor files passed 21 tests at that stage.

Follow [current contract](../../arch/deployment-contracts.md) and
[review evidence](../../changes/0.15.2/addons-calibration-deployment-hooks-qa/50-verification.md).
Existing lifetime/error/recovery rules already required this outcome; earlier
fixtures omitted this fault boundary. Keep the demonstrated regression and cite
the owning rule instead of duplicating global instructions. No vulnerability,
production outage or external deployment success is asserted.
