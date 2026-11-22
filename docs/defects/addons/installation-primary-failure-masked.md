# Repository installation cleanup replaced the primary failure

- ID: `addons/installation-primary-failure-masked`.
- Kind: confirmed bug. Status: fixed; regression and bounded review checks passed.
- Discovered: 2026-11-18. Affected baseline: `318a475b0ffb8c121e8dc6c9efec8e29609b30ba`
  (0.15.1 metadata); earlier range unknown. Fix target: 0.15.2, unpublished.
- Read for: InstallAddonFromRepository, activation-failure, discard, AggregateError, immutable-claim.

The application's finally-discard rejection replaced an activation/reservation failure. The initiating error vanished even though the immutable Pending claim still represented unfinished activation.

Correction: Attempt disposal after the main operation, retain both failures in AggregateError when necessary, and acknowledge only a completed result with no outstanding failure. Keep the existing immutable claim and installed-identity reconciliation.

Outcome/recovery: The request fails truthfully with no false Installed acknowledgement. Reread/retry resolves the same claimed release; confirmed active code is not blindly reinstalled. Technical details remain behind the existing safe HTTP error boundary.

## Regression and prevention

[Owning regression](../../../test/app/addons/install-addon-from-repository.spec.ts).
Executed RED exposed only the synthetic cleanup error. GREEN preserves ordered activation/cleanup causes and the Pending claim, with no completion call. Existing exact-release and lost-acknowledgement tests remain passing.

Follow [current contract](../../arch/site-addons-contracts.md) and
[review evidence](../../changes/0.15.2/addons-calibration-deployment-hooks-qa/50-verification.md).
Existing lifetime/error/recovery rules already required this outcome; earlier
fixtures omitted this fault boundary. Keep the demonstrated regression and cite
the owning rule instead of duplicating global instructions. No vulnerability,
production outage or external deployment success is asserted.
