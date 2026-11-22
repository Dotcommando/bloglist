# Cases and evidence map

All rows were executed within the exact selections in [verification](50-verification.md).
The [audit](../../../audits/0.15.2-installation-jsonld-media-publication.md#operation-evidence)
maps all 38 operations and their adapter methods. A passing added characterization
is not counted as a bug.

| Case | Guarantee | Primary evidence |
| --- | --- | --- |
| INSTALL-KEY | Local-key faults stay technical; total ten-second budget includes pending key; no late DNS/request after timeout | [Adapter regressions](../../../../test/adapters/installation-settings.spec.ts), real installation integration |
| INSTALL-AUTH | Authorize before reads and after slow probe; unchanged origin no-op, revoked/stale actor cannot mutate | [Application](../../../../test/app/installation-settings.spec.ts), installation/context integration |
| JSONLD-CATALOG | Owned current catalog, CAS and explicit graph values, no remote effects | Catalog/typed/identity/ownership units, real catalog and publication integrations |
| JSONLD-INSPECT | Draft versus selected published static/Request; single evaluation, split UTF-8, invalid/truncated/failed stream and foreign result | [Published inspection](../../../../test/app/json-ld/inspect-json-ld-published.spec.ts), [actual parser](../../../../test/adapters/json-ld-inspection.spec.ts), real composed inspection |
| ASSET-LIFECYCLE | Actual limits/type/geometry, owned immutable versions, processing claim, Failed/Ready outcome and disposal | Asset/processing/storage/type units, media scheduling integration |
| MEDIA-IO | Technical read failure is not invalid image content; temporary state disposed | [Inspection regression](../../../../test/adapters/media-inspection-errors.spec.ts) |
| MEDIA-FENCE | Delayed v1 cannot replace acknowledged v2 or remove current files | [Projection unit](../../../../test/adapters/file-library-projection.spec.ts), [real race](../../../../test/integration/media-reconciliation-fence.integration.spec.ts) |
| MEDIA-LOCK | Failed stage creation/cleanup releases owned lock; primary and sibling errors preserved; retry works | Projection failure units and real filesystem |
| MEDIA-EDIT | Namespace/CAS, original ownership, preserved unrelated files, replacement/move/delete/reference repair, favicon and scoped delivery | Source/reference/usage/store/HTTP units; thirteen real Files scenarios |
| RELEASE-STAGE | Failed child mkdir leaves no owned stage or metadata; later stage succeeds | [Store regression](../../../../test/adapters/publication-store.spec.ts), real publication integration |
| PREVIEW-RETRY | Failed listener start does not poison future attempts; private/raw output and close | [Recovery unit](../../../../test/adapters/local-preview-recovery.spec.ts), two real preview cases |
| FRONTEND-IO | Binary assets use bounded repeatable I/O and exact checksums; invalid HTML starts no asset work; all started siblings settle | [Asset lifetime](../../../../test/adapters/frontend-asset-lifetime.spec.ts), real publication build |
| RELEASE-CAS | Render/build/stage failure preserves active output; lost acknowledgement receipt and uncertain-abort no replay; frozen Build and unrelated drafts | Release/build/store/activation units, real static/Request/admin/editorial/media-address publication |
| PUBLIC-READ | Active owned release only, bounded verified artifacts, truthful fresh catalog and cache fences | Artifact/plan/routing/catalog/cache units, real public delivery |
| EXPORT-IO | Stream payloads with size/hash checks, metadata-only installed map, atomic prior-output preservation and streamed CSP | [Streaming](../../../../test/adapters/cloudflare-deployment-streaming.spec.ts), output units, real local preparation/Worker |
| QA-ORACLE | Explicit synthetic authority/manifest/cookies, self-owned file identity and true before/after deletion | Access/amplification units, real installation and filtered Files integration |
