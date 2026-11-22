# Failed repository staging cleanup lost its recovery target

- ID: `addons/failed-staging-cleanup-lost-ownership`.
- Kind: confirmed bug. Status: fixed; regression and bounded review checks passed.
- Discovered: 2026-11-18. Affected baseline: `318a475b0ffb8c121e8dc6c9efec8e29609b30ba`
  (0.15.1 metadata); earlier range unknown. Fix target: 0.15.2, unpublished.
- Read for: GitHub-package-delivery, private-staging, discard, cleanup-ownership, next-preparation.

The provider cleared its staged identity before removal and forgot the directory when removal failed. After the fault cleared the next preparation downloaded another package while leaving the old private directory behind.

Correction: Retain the failed cleanup target and retry its bounded removal under preparation admission before starting another download. Track preparation-failure cleanup as well; preserve secondary cleanup errors and release admission without losing that target.

Outcome/recovery: Private state remains owned by code. After storage recovery the next valid preparation removes the old directory, then prepares normally; it never activates abandoned bytes or asks a person to delete an internal object. Process-kill leftovers retain the existing private-artifact limitation.

## Regression and prevention

[Owning regression](../../../test/adapters/github-addon-delivery.spec.ts).
Executed RED found two directories after a successful next preparation. GREEN proves one new directory, absence of the old one, and an empty staging root after final disposal. Files/archive work is real; the GitHub peer and removal fault are controlled.

Follow [current contract](../../arch/site-addons-contracts.md) and
[review evidence](../../changes/0.15.2/addons-calibration-deployment-hooks-qa/50-verification.md).
Existing lifetime/error/recovery rules already required this outcome; earlier
fixtures omitted this fault boundary. Keep the demonstrated regression and cite
the owning rule instead of duplicating global instructions. No vulnerability,
production outage or external deployment success is asserted.
