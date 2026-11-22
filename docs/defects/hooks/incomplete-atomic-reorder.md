# Hook reordering accepted a stale incomplete binding list

- ID: `hooks/incomplete-atomic-reorder`.
- Kind: confirmed bug. Status: fixed; regression and bounded review checks passed.
- Discovered: 2026-11-18. Affected baseline: `318a475b0ffb8c121e8dc6c9efec8e29609b30ba`
  (0.15.1 metadata); earlier range unknown. Fix target: 0.15.2, unpublished.
- Read for: reorder, complete-binding-set, transaction-snapshot, concurrent-subscription.

The persistence adapter captured the complete binding projection before starting its transaction. A new subscription committed between that read and transaction entry; a request omitting it still succeeded and changed existing versions. This violated the complete-list optimistic ordering contract.

Read the projection using the transaction session inside the retried operation; perform its reads sequentially, then compare the complete identities/versions and update under the same registry fence. A stale user ordering returns StaleWrite; reload the tree and order the complete current set. No automatic merge discards another binding.

[Adapter regression](../../../test/adapters/hook-configuration-order.spec.ts) and [real boundary regression](../../../test/integration/hook-boundary-regressions.integration.spec.ts).
Executed unit and real MongoDB RED both resolved an incomplete ordering instead of rejecting it. GREEN passed 11 focused units and three real hook integration scenarios. The integration commits a competing subscription at transaction entry and verifies both current bindings and unchanged prior version.
These checks use synthetic owned data; no vulnerability or business add-on execution
is asserted. Final source/documentation checks passed.

Follow [current hooks](../../arch/hooks.md) and
[review evidence](../../changes/0.15.2/addons-calibration-deployment-hooks-qa/50-verification.md).
Existing rules already required this outcome; previous tests omitted this exact
concurrent membership/no-effect receipt case. Keep the regression at the actual
owning boundary instead of copying a new global rule.
