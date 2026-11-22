# Media tests selected unrelated shared files instead of their own fixtures

- ID: `qa/media-tests-selected-unrelated-resources`.
- Kind: confirmed bug. Status: fixed; executed regression and bounded review checks passed.
- Discovered: 2026-11-18. Affected baseline: `b5edf6842469155a08e767d94fb66f5f64fdf59f`
  (0.15.1 metadata); earlier range unknown. Fix target: 0.15.2, unpublished.
- Read for: QA, file-id, fixture-state, order-dependence, deletion-oracle, reconciliation.

## Symptom and correction

Four backend media scenarios failed when the selection included an earlier font upload or excluded the browser test: first-item lookups selected the wrong file, global-empty expectations rejected unrelated surviving files, and recovery assumed browser.png already existed. A deletion assertion also used a path that was never the actual original.

Cause: Assertions addressed shared list positions, state produced by another scenario or an obsolete directory rather than the operation's owned file.

Correction and guarantee: Seed case-specific files, select explicit names/IDs, scope preservation checks to the affected file and retain unrelated files. Recovery seeds its own upload. Deletion first proves the real private original exists, then proves its absence after removal.

Error/recovery: QA-only; real MIME, ownership, concurrency, journal and deletion behavior stays enabled. Do not delete meaningful failing scenarios or disable other file types to hide fixture coupling.

## Executed regression and prevention

The 0.16.0 release selection exposed the same known cross-scenario dependency in
the real Files browser scenario: it expected a `small.png` created by an earlier
test. It now owns a separate site, image, Photos folder and referencing draft,
and checks deletion by the owned file identity. See
[current evidence](../../changes/0.16.0/admin-site-journeys/50-verification.md).

[File-library integration](../../../test/integration/file-library.integration.spec.ts): retains/replaces originals; isolates sites; concurrent moves/Force delete; resumes journaled output/cleanup.

Initial selected run: 9 passed, 4 failed, 6 outside-filter cases. Corrected same thirteen backend cases all passed, including recovery without the browser scenario. Actual storage/MongoDB/HTTP adapters remain bound. Evidence is from Windows with synthetic inputs and owned temporary
storage; no production site was modified. Final scoped runs/limits are maintained
in the [verification log](../../changes/0.15.2/installation-jsonld-media-publication-qa/50-verification.md).

Owning contract/rule: [current guarantee](../../cms-development/testing-policy.md#isolation-and-execution). The regression enforces
that existing guarantee; no copied global checklist or invented security severity.

Continuation at f5f09c7 rediscovered this selection mechanism in the shared browser
page helper: searching for title A by substring matched the system sitemap row as
well as the authored page. Match the exact title before selecting its treeitem.
The real routing cycle/recovery tests now exercise that single-letter title.
This fixes the existing test helper; no production page-selection behavior changes
and no duplicate defect card is created. See the same current verification dossier.
