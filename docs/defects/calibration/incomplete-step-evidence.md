# Missing API-step observations could produce a calibration recommendation

- ID: `calibration/incomplete-step-evidence`.
- Kind: confirmed bug. Status: fixed; regression and bounded review checks passed.
- Discovered: 2026-11-18. Affected baseline: `318a475b0ffb8c121e8dc6c9efec8e29609b30ba`
  (0.15.1 package metadata); earlier range unknown. Fix target: 0.15.2, unpublished.
- Read for: StartCalibrationRun/search, add-on API scenarios, stepMetrics,
  missing/foreign observations, winner eligibility and restoration.

The search only required a step-metrics object to exist and checked its supplied
values. An empty map, page-only map or unrelated site's metrics all passed when
aggregate/site results passed, producing Completed with an applicable winner.
No quota bypass or malicious generator exploit is asserted: deterministic load
port inputs reproduce the application's missing-evidence acceptance.

Require every positive scenario's exact site/path page and API measurements when
API steps are selected, including nonempty/passing metrics. Zero-share targets
still need no measurement. Preserve existing aggregate/site criteria and restore
original resources before recording Failed/no winner. The administrator sees
the existing failed run and can rerun after repairing the generator/evidence;
incomplete measurements cannot be applied as a recommendation.

[Regression](../../../test/app/calibration-run.spec.ts):
`refuses a recommendation when positive API-step metrics are %s` and
`confirms measured positive API steps without requiring metrics for zero-share targets`.
Executed RED: empty/missing-API/foreign-site inputs returned Completed with winner;
unmeasured and measured controls already passed. GREEN: all 22 selected search,
budget and apply tests passed. Both actual helper/Mongo evidence cases and the serving-fork/browser workflow passed.

Follow [current calibration](../../arch/resource-calibration.md) and
[review evidence](../../changes/0.15.2/addons-calibration-deployment-hooks-qa/50-verification.md).
The existing contract already forbade unmeasured positive steps; enforcement
checked only map presence/values, and earlier search fixtures had no API steps.
