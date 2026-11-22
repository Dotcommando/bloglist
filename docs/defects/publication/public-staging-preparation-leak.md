# Failed public-directory preparation left a release staging tree

- ID: `publication/public-staging-preparation-leak`.
- Kind: confirmed bug. Status: fixed; executed regression and bounded review checks passed.
- Discovered: 2026-11-18. Affected baseline: `b5edf6842469155a08e767d94fb66f5f64fdf59f`
  (0.15.1 metadata); earlier range unknown. Fix target: 0.15.2, unpublished.
- Read for: release-staging, ENOSPC, temporary-directory, failure-cleanup.

## Symptom and correction

Creating the public child of an owned .staging-* directory could fail before the try/finally, leaving that private temporary tree behind. Repeated failures accumulated unreclaimed directories.

Cause: The parent was created successfully, but child preparation was outside the cleanup lifetime.

Correction and guarantee: Move public-child preparation into the existing try/finally and use the bounded filesystem removal policy. Never insert Ready metadata or activate a release after failed preparation.

Error/recovery: The publication fails without switching the active pointer; existing output remains served and authored input remains available. Once the storage fault clears, a fresh attempt succeeds and does not need an operator to delete this owned stage.

## Executed regression and prevention

[Publication store](../../../test/adapters/publication-store.spec.ts): `removes its staging tree when preparing the public directory fails and permits a fresh retry`.

RED found an owned .staging-* entry after injected ENOSPC at public-child mkdir. GREEN proves its absence, no metadata insertion on failure and a later successful artifact/metadata write. The whole nine-case store selection passed. Evidence is from Windows with synthetic inputs and owned temporary
storage; no production site was modified. Final scoped runs/limits are maintained
in the [verification log](../../changes/0.15.2/installation-jsonld-media-publication-qa/50-verification.md).

Owning contract/rule: [current guarantee](../../arch/fork-publication-and-failure-tests.md#publication). The regression enforces
that existing guarantee; no copied global checklist or invented security severity.
