# Rejected created runtimes skipped their provided disposer

- ID: `addons/invalid-created-runtime-not-disposed`.
- Kind: confirmed bug. Status: fixed; regression and bounded review checks passed.
- Discovered: 2026-11-18. Affected baseline: `318a475b0ffb8c121e8dc6c9efec8e29609b30ba`
  (0.15.1 metadata); earlier range unknown. Fix target: 0.15.2, unpublished.
- Read for: runtime-install, createRuntime, invalid-hook-extension, invalid-handler, close, resource-lifetime.

After createRuntime returned, invalid hooks or handler shape threw without calling an available close function. The runtime had been created but never entered the loaded registry, so registry.close could not dispose it later.

Correction: Route all post-creation validation rejections through the provided disposer before rejecting activation. Preserve validation and cleanup causes together when both fail; no invalid runtime becomes selected.

Outcome/recovery: Activation fails and retains intact immutable bytes/claim for the existing retry/repair workflow. Host-owned cleanup invokes the publisher's disposer; no operator is told to manipulate an inaccessible runtime object.

## Regression and prevention

[Owning regression](../../../test/adapters/addon-package-registry-install.spec.ts).
Executed RED recorded only opened for invalid hook/handler runtimes; GREEN records opened/closed and no selected runtime/pointer. A disposer-failure control also preserves both validation and cleanup causes.
These are actual compiled synthetic package evaluations with a lifecycle sentinel, not proof of an OS handle leak or hostile-code sandbox.

Follow [current contract](../../arch/live-addon-updates.md) and
[review evidence](../../changes/0.15.2/addons-calibration-deployment-hooks-qa/50-verification.md).
Existing lifetime/error/recovery rules already required this outcome; earlier
fixtures omitted this fault boundary. Keep the demonstrated regression and cite
the owning rule instead of duplicating global instructions. No vulnerability,
production outage or external deployment success is asserted.
