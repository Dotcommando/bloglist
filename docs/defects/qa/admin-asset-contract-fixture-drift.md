# Admin asset fixtures omitted current manifest and cookie/access contracts

- ID: `qa/admin-asset-contract-fixture-drift`.
- Kind: confirmed bug. Status: fixed; executed regression and bounded review checks passed.
- Discovered: 2026-11-18. Affected baseline: `b5edf6842469155a08e767d94fb66f5f64fdf59f`
  (0.15.1 metadata); earlier range unknown. Fix target: 0.15.2, unpublished.
- Read for: QA, admin-build-manifest, protected-bundle, HEAD, installation-cookies.

## Symptom and correction

The HEAD amplification test expected 200 without private-bundle authorization. The installation integration failed startup without .vite/manifest.json and later expected one Secure cookie although the current product uses separate API/UI path cookies.

Cause: Fixtures retained pre-protected-bundle assumptions. They failed before their intended metadata-only/origin-change behavior could be assessed.

Correction and guarantee: Make HEAD metadata verification explicitly authorized; keep real access regressions. Provide a minimal valid synthetic entry manifest/file for the installation fixture and assert both actual path-scoped Secure cookies.

Error/recovery: QA-only correction. Product authorization remains closed by default and private dynamic assets remain protected. The fixture does not turn a network/setup failure into evidence of a vulnerability.

## Executed regression and prevention

[Amplification](../../../test/adapters/public-file-amplification.spec.ts), [actual access](../../../test/adapters/admin-document-http.spec.ts), [installation workflow](../../../test/integration/installation-settings.integration.spec.ts).

RED: HEAD 401 versus 200; installation startup ENOENT for manifest; then two cookies versus expected one. Corrected access/amplification selection passed 7 tests and full installation integration passed all 3 scenarios. Evidence is from Windows with synthetic inputs and owned temporary
storage; no production site was modified. Final scoped runs/limits are maintained
in the [verification log](../../changes/0.15.2/installation-jsonld-media-publication-qa/50-verification.md).

Owning contract/rule: [current guarantee](../../arch/admin-authentication.md). The regression enforces
that existing guarantee; no copied global checklist or invented security severity.
