# Existing boundaries

- Add-ons: [site contracts](../../../arch/site-addons-contracts.md),
  [live updates](../../../arch/live-addon-updates.md), ADRs 0036/0052/0088.
  Global immutable installation claims versus site connections; global update
  authority; paused admission and selected immutable code; no coordinator code
  evaluation, no automatic enablement, no private configuration in public output.
- Calibration: [current calibration](../../../arch/resource-calibration.md),
  ADRs 0085/0086/0089. Installation authority, all-site traffic and enforced shared
  quotas, observed readiness, original-resource restoration, retained evidence
  and guarded explicit application. Historical site/native snapshots remain data,
  not authority for new unenforced runs.
- Deployment: [contracts](../../../arch/deployment-contracts.md),
  [Cloudflare boundary](../../../arch/cloudflare-deployment.md), ADR 0055.
  Site/target versions, exact captured publication, trusted executor, bounded
  delivery ownership, durable Unknown state and reconciliation before upload
  replay; restore exclusion marker outlives unresolved effects.
- Hooks: [runtime contract](../../../arch/hooks.md), ADR 0043. Owned handler
  drafts/applied immutable versions, captured subscriptions and grants, complete
  reorder/CAS, pure bounded evaluation, per-lane ordering, stable command receipts,
  source transactional fences, truthful retry/skip and safe history.

Selected prior records:
[public-only calibration composition](../../../defects/composition/public-only-calibration.md)
applies to optional provider resolution; do not inject fake administrator authority.
[disconnected admission](../../../defects/runtime/disconnected-dispatch-admission.md)
applies if tracing crosses admitted worker requests. The previous
[streamed export fix](../../../defects/publication/deployment-payloads-buffered.md)
is retained and will not be counted again. Unrelated page/media defects are not
loaded merely because this review shares release 0.15.2.

Inventory: 38 classes, all read. Baseline application selection: 19 files/82 passed.
Completed operation/used-adapter, security and limitation mappings are in the
[bounded audit](../../../audits/0.15.2-addons-calibration-deployment-hooks.md).
Actual final selections, TDD and fixture provenance are in [verification](50-verification.md).
Application units alone were not treated as storage/execution/recovery proof.
