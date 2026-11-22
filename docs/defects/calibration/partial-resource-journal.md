# A failed calibration journal write left invalid recovery state

- ID: `calibration/partial-resource-journal`.
- Kind: confirmed bug. Status: fixed; regression and bounded review checks passed.
- Discovered: 2026-11-18. Affected baseline: `318a475b0ffb8c121e8dc6c9efec8e29609b30ba`
  (0.15.1 metadata); earlier range unknown. Fix target: 0.15.2, unpublished.
- Read for: beginCalibration, private-journal, ENOSPC, atomic-publication, restart-recovery.

Writing directly to the final exclusive journal could leave a truncated file on ENOSPC before a lease existed or any temporary resource change. A later begin saw EEXIST; restart could parse invalid recovery data.

Correction: Write complete bytes to an owned unique sibling, then publish with an exclusive hard link so an existing journal cannot be overwritten. Remove failed owned preparation; release admission on every exit and preserve cleanup failures with the primary cause.

Outcome/recovery: Original allocation remains unchanged when preparation fails. Once private storage is available, the next begin succeeds without restarting or asking a person to edit JS state. Existing durable restoration still handles an actually admitted run.

## Regression and prevention

[Owning regression](../../../test/adapters/calibration-resource-lease.spec.ts).
Executed RED left calibration-journal.json after an actual partial write and injected ENOSPC. GREEN verifies only unchanged allocation.json remains, exact original journal data on retry, and successful restore. Existing resource persistence and workflow checks pass; final bounded review checks passed.

Follow [current contract](../../arch/resource-calibration.md) and
[review evidence](../../changes/0.15.2/addons-calibration-deployment-hooks-qa/50-verification.md).
Existing lifetime/error/recovery rules already required this outcome; earlier
fixtures omitted this fault boundary. Keep the demonstrated regression and cite
the owning rule instead of duplicating global instructions. No vulnerability,
production outage or external deployment success is asserted.
