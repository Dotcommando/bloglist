# A known no-effect hook command rejection blocked safe recovery

- ID: `hooks/known-rejection-blocked-safe-skip`.
- Kind: confirmed bug. Status: fixed; regression and bounded review checks passed.
- Discovered: 2026-11-18. Affected baseline: `318a475b0ffb8c121e8dc6c9efec8e29609b30ba`
  (0.15.1 metadata); earlier range unknown. Fix target: 0.15.2, unpublished.
- Read for: command-outcome, rejected, no-effects, safe-skip, receipt-state.

finishCommand mapped confirmed=false/retrySafe=false to OutcomeUnknown even when the command adapter explicitly returned rejected=true before effects. Delivery history said Failed but its command receipt falsely claimed unresolved effects; safe skip returned Conflict.

Persist rejected-without-effects as Failed, retaining the rejected result; preserve OutcomeUnknown for genuinely uncertain effects. Existing explicit skip can settle the lane, or the known failure can be retried under its current version. Do not instruct a user to reconcile an effect that is known not to have occurred.

[Adapter regression](../../../test/adapters/hook-command-outcomes.spec.ts) and [real boundary regression](../../../test/integration/hook-boundary-regressions.integration.spec.ts).
Executed unit RED persisted OutcomeUnknown rather than Failed. Real MongoDB/runtime/command-adapter RED rejected safe skip after blocking injected site authority before any registered effect. GREEN preserves Failed command evidence, allows Skip and settles the lane; unknown-outcome controls remain unchanged.
These checks use synthetic owned data; no vulnerability or business add-on execution
is asserted. Final source/documentation checks passed.

Follow [current hooks](../../arch/hooks.md) and
[review evidence](../../changes/0.15.2/addons-calibration-deployment-hooks-qa/50-verification.md).
Existing rules already required this outcome; previous tests omitted this exact
concurrent membership/no-effect receipt case. Keep the regression at the actual
owning boundary instead of copying a new global rule.
