# A failed loopback preview start poisoned later preview attempts

- ID: `publication/preview-startup-rejection-retained`.
- Kind: confirmed bug. Status: fixed; executed regression and bounded review checks passed.
- Discovered: 2026-11-18. Affected baseline: `b5edf6842469155a08e767d94fb66f5f64fdf59f`
  (0.15.1 metadata); earlier range unknown. Fix target: 0.15.2, unpublished.
- Read for: private-preview, listen, startup, retry, owned-listener.

## Failure, guarantee and recovery

After a supported listen failure, the adapter retained the rejected starting Promise and a non-listening server object. Every subsequent preview reused that failure; close could also report ERR_SERVER_NOT_RUNNING.

Cause: The cached startup state was never cleared when the listen Promise rejected.

Correction: Await startup, clear only the failed attempt's owned server/Promise and propagate its original failure. A later request starts a fresh listener; successful listeners still remain shared and explicitly close.

Outcome: Draft/input is preserved and the first preview reports failure. After the transient binding problem clears, retry works without restarting the CMS or asking an operator to manage a JS object.

## Regression and prevention

[Recovery unit](../../../test/adapters/local-preview-recovery.spec.ts): `recovers a failed preview listener start with a fresh owned listener`; [real loopback scenarios](../../../test/integration/preview-delivery.integration.spec.ts).

RED: the second preview returned the first listen error. GREEN: second attempt serves actual recovered HTML and closes cleanly; both existing raw/private loopback integrations pass. The first supported listen-error event is controlled, not a claim of a reproduced OS outage on an owner machine.

Follow the [owning guarantee](../../arch/rendering-and-publication.md) and
[scoped verification log](../../changes/0.15.2/installation-jsonld-media-publication-qa/50-verification.md).
Existing standards already covered this boundary; the missing fault/transfer
assertion allowed it to escape. Windows/synthetic fixture evidence does not
claim whole-product security or live-installation verification.
