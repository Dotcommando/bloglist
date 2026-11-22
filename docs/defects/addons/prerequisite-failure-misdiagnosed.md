# Runtime prerequisite faults were always diagnosed as missing migrations

- ID: `addons/prerequisite-failure-misdiagnosed`.
- Kind: confirmed bug. Status: fixed; regression and bounded review checks passed.
- Discovered: 2026-11-18. Affected baseline: `318a475b0ffb8c121e8dc6c9efec8e29609b30ba`
  (0.15.1 metadata); earlier range unknown. Fix target: 0.15.2, unpublished.
- Read for: enabled runtime availability, verifyMigrations, local storage/database
  faults, private causes and misleading migration recovery advice.

The availability adapter replaced every verifier failure with 'Apply the installed
add-on migrations' and discarded its cause. The actual verifier can also fail on
private filesystem or MongoDB reads; applying migrations cannot correct those
faults and can be the wrong next action.

Keep the established fail-closed AddonUnavailable/503 outcome for an unavailable
runtime prerequisite, retain the original private cause non-enumerably, and avoid
claiming a specific migration remedy without evidence. No enable/configure write
occurs. The administrator sees unavailable runtime prerequisites; the responsible
dependency lifecycle/diagnostics can distinguish storage availability from missing
or changed migration receipts before selecting an actual repair. Code retains
the cause instead of asking a user to operate on internal JS state.

[Regression](../../../test/adapters/registered-addon-availability.spec.ts):
`keeps a private prerequisite failure as the cause without diagnosing it as missing migrations`.
Executed RED lost the injected EIO cause and returned migration-only advice.
GREEN preserves the exact cause while excluding it from JSON serialization;
unregistered-before-verify and legitimate verified-runtime controls pass.
This proves error translation with a controlled verifier fault, not a real outage
or migration repair. Actual installation, all three live updates and final source checks passed.

Follow [site add-ons](../../arch/site-addons-contracts.md),
[actionable error outcomes](../../cms-development/feature-design.md#error-outcomes-and-recovery)
and [review evidence](../../changes/0.15.2/addons-calibration-deployment-hooks-qa/50-verification.md).
The existing standard already required evidence before choosing a remedy; older
fixtures did not check a non-migration verifier fault or private cause retention.
