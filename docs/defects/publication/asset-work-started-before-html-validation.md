# HTML validation could abandon already-started asset reads

- ID: `publication/asset-work-started-before-html-validation`.
- Kind: confirmed bug. Status: fixed; executed regression and bounded review checks passed.
- Discovered: 2026-11-18. Affected baseline: `b5edf6842469155a08e767d94fb66f5f64fdf59f`
  (0.15.1 metadata); earlier range unknown. Fix target: 0.15.2, unpublished.
- Read for: frontend-build, HTML-validation, Promise-ownership, asynchronous-failure.

## Failure, guarantee and recovery

The HTML walk started async asset lookups for an early node, then rejected a later image missing width/height before reaching Promise.all. A failed lookup became an unhandled rejection instead of owned build failure.

Cause: Promise creation and fallible synchronous markup validation were interleaved; the aggregation boundary was reached only after the walk succeeded.

Correction: Collect deferred HTML-asset tasks during the validation walk. Start them only after that walk succeeds and observe/settle every task before propagating the authored-order failure. Do not install a global rejection handler or pretend the build succeeded.

Outcome: Invalid source reports its existing validation failure without starting those HTML-asset reads. An asset failure settles owned sibling work and rejects the build; it cannot activate incomplete output. Previously completed CSS/source work is not claimed to be absent.

## Regression and prevention

[Asset lifetime regression](../../../test/adapters/frontend-asset-lifetime.spec.ts): `validates all HTML nodes before starting asynchronous local asset work`.

RED observed an early realpath attempt plus one Vitest unhandled rejection when a later image failed validation. GREEN starts no HTML-asset I/O on that invalid document; no unhandled rejection remains. Adjacent frontend checks pass. No security exploit or actual production-process crash was demonstrated.

Follow the [owning guarantee](../../cms-development/feature-design.md#asynchronous-ownership-and-cleanup) and
[scoped verification log](../../changes/0.15.2/installation-jsonld-media-publication-qa/50-verification.md).
Existing standards already covered this boundary; the missing fault/transfer
assertion allowed it to escape. Windows/synthetic fixture evidence does not
claim whole-product security or live-installation verification.
