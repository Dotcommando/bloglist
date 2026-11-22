# Actual verification

Date: 2026-11-18. Branch/target: `0.15.2`. Baseline:
`b5edf6842469155a08e767d94fb66f5f64fdf59f`, the previous auth/users/pages
review committed at the owner's request. Package metadata remains 0.15.1;
these corrections are unpublished. See the [bounded audit](../../../audits/0.15.2-installation-jsonld-media-publication.md)
for operation, adapter, security and exclusion mappings.

## Final results

- Explicit affected unit/adapter/architecture selection: **104 files, 333 passed**.
  No failing, skipped or unhandled-rejection result in the final selection.
- Actual isolated integrations: **39 passed**: nine-file selection 25,
  Files backend filter 13, local Cloudflare preparation 1. Six Files UI/onboarding
  cases were excluded by the explicit backend filter, not counted as passing.
- Total distinct final selected tests: **372 passed**. Earlier focused reruns are
  not added again. No full-suite run.
- `npm run format`, `npm run lint`, `npm run typecheck` and `npm run build`
  passed. Server TypeScript and Svelte checking passed (0 errors/0 warnings).
  Build retains the existing informational admin chunk-size warning.
- Selected architecture checks are part of the 104-file unit manifest.
- Documentation closure passed: 29 changed/new Markdown files, 202 local links
  and anchors, all 11 card/index/inventory classifications, 104 unique existing
  unit files and all 38 operation names. Git whitespace checks passed. The owned
  auto-removed MongoDB container was checked by ID/task label, stopped, and is
  absent from the exact-name listing. No owner service was stopped.

## Defect inventory

**11 new confirmed bugs: 9 production bugs and 2 QA bugs; 0 confirmed
vulnerabilities.** The previous review's bugs and reused historical records are
not counted here. Canonical cards contain the scenario links, root cause,
correction and user/recovery outcome.

1. Confirmed bug: [installation/probe-key-storage-error-masking](../../../defects/installation/probe-key-storage-error-masking.md) - Local verification-key storage failure became candidate-address Validation.
2. Confirmed bug: [media/stale-reconciler-overwrites-current-output](../../../defects/media/stale-reconciler-overwrites-current-output.md) - Delayed reconciliation replaced a newer acknowledged projection.
3. Confirmed bug: [media/projection-lock-leaked-before-staging](../../../defects/media/projection-lock-leaked-before-staging.md) - Failed staging creation stranded a media writer lock.
4. Confirmed bug: [publication/public-staging-preparation-leak](../../../defects/publication/public-staging-preparation-leak.md) - Failed public-directory preparation left a release staging tree.
5. Confirmed QA bug: [qa/admin-asset-contract-fixture-drift](../../../defects/qa/admin-asset-contract-fixture-drift.md) - Admin asset fixtures omitted current manifest and cookie/access contracts.
6. Confirmed QA bug: [qa/media-tests-selected-unrelated-resources](../../../defects/qa/media-tests-selected-unrelated-resources.md) - Media tests selected unrelated shared files instead of their own fixtures.
7. Confirmed bug: [media/inspection-io-error-masking](../../../defects/media/inspection-io-error-masking.md) - Media inspection blamed file content for a system read failure.
8. Confirmed bug: [publication/preview-startup-rejection-retained](../../../defects/publication/preview-startup-rejection-retained.md) - A failed loopback preview start poisoned later preview attempts.
9. Confirmed bug: [publication/authored-assets-buffered-in-build](../../../defects/publication/authored-assets-buffered-in-build.md) - Authored binary assets were buffered by the frontend builder.
10. Confirmed bug: [publication/asset-work-started-before-html-validation](../../../defects/publication/asset-work-started-before-html-validation.md) - HTML validation could abandon already-started asset reads.
11. Confirmed bug: [publication/deployment-payloads-buffered](../../../defects/publication/deployment-payloads-buffered.md) - Deployment preparation retained complete binary payloads in memory.

## Reproduction and coverage classification

Every production fix above started with an executed failing behavioral regression.
The cards distinguish controlled dependency faults from real filesystem, HTTP and
MongoDB work. In particular:

- Delayed reconciliation reproduced DB v2/pending=false together with stale files
  using actual MongoDB and filesystem adapters, before the version check was
  moved under the existing writer lock. The first unit fixture ownership error
  was corrected before that behavioral RED and is not evidence of the defect.
- Actual stage mkdir faults reproduced stranded media writer.lock and release
  .staging-* output. GREEN checks prove cleanup and a subsequent successful retry.
  Multiple primary/cleanup failures remain observed; no person must remove a
  failed operation's live JS object or owned empty lock.
- Key-provider failure reproduced misleading Validation. A later regression
  also guards the existing ten-second total budget while the local key is pending:
  late rejection stays observed and cannot start remote probing. An intermediate
  network-only-budget implementation was corrected before completion; it is not
  an additional pre-existing defect.
- Inspection preserves system EIO and disposes its temporary file. The file-type
  dependency rejection is controlled; actual staging and cleanup are exercised.
- Preview's controlled first listen failure previously poisoned the next call;
  GREEN serves real loopback HTML on the next start and closes the listener.
- Authored binary and export regressions prove bounded transfer mechanisms,
  exact size and independent SHA-256. They are not whole-process memory benchmarks.
- HTML validation RED had early asset work and an observed unhandled rejection.
  GREEN defers work until validation and settles all started sibling work.
- QA REDs were authorization/manifest/cookie-contract drift and unrelated-file/
  order-dependent fixture selection. Access policy was preserved; the deletion
  oracle now proves the actual private original exists before deleting it.

New published JSON-LD inspection/parser, no-op/revocation and unknown-abort tests
are characterization: they passed on existing behavior and are not fabricated
bugs/vulnerabilities. Pinned-driver session semantics were inspected. The redundant
release-activation endSession catch was removed; unsupported mock rejection is
not evidence of a leaked session. Unknown abort does not cause write replay.

Initial application baseline: 41 files/120 passed. Initial 39-file adapter
selection: 132 passed, one failed protected-bundle HEAD fixture. Initial selected
Files integration: 9 passed/4 failed/6 excluded. The final selections above
supersede those failures. A media-scheduling nested-root fixture introduced during
this review was corrected before the successful run; it is not a baseline defect.

## Reproducible unit selection

PowerShell, from the repository root:

```powershell
$unitFiles = @(
  'test/app/installation-settings.spec.ts',
  'test/app/json-ld/build-json-ld-page.spec.ts',
  'test/app/json-ld/inspect-json-ld.spec.ts',
  'test/app/json-ld/json-ld-lists.spec.ts',
  'test/app/json-ld/json-ld-node-settings.spec.ts',
  'test/app/json-ld/json-ld-page-entities.spec.ts',
  'test/app/json-ld/json-ld-render-runtime.spec.ts',
  'test/app/json-ld/json-ld-typed-values.spec.ts',
  'test/app/json-ld/list-json-ld-catalog.spec.ts',
  'test/app/json-ld/save-json-ld-catalog.spec.ts',
  'test/app/media/create-media-folder.spec.ts',
  'test/app/media/delete-site-favicon.spec.ts',
  'test/app/media/file-library-actions.spec.ts',
  'test/app/media/get-asset.spec.ts',
  'test/app/media/library-image-upload.spec.ts',
  'test/app/media/list-files.spec.ts',
  'test/app/media/original-image.spec.ts',
  'test/app/media/process-asset.spec.ts',
  'test/app/media/read-public-media.spec.ts',
  'test/app/media/site-favicon.spec.ts',
  'test/app/media/upload-asset.spec.ts',
  'test/app/publication/editorial-options-consistency.spec.ts',
  'test/app/publication/find-published-pages.spec.ts',
  'test/app/publication/get-publication-options.spec.ts',
  'test/app/publication/get-published-artifact.spec.ts',
  'test/app/publication/prepare-site-deployment.spec.ts',
  'test/app/publication/prepared-catalog-regression.spec.ts',
  'test/app/publication/preview-markdown-draft.spec.ts',
  'test/app/publication/preview-markdown-published.spec.ts',
  'test/app/publication/preview-page.spec.ts',
  'test/app/publication/publish-current-page.spec.ts',
  'test/app/publication/publish-media-address-release.spec.ts',
  'test/app/publication/publish-page-release.spec.ts',
  'test/app/publication/publish-routing-release.spec.ts',
  'test/app/publication/publish-site-release.spec.ts',
  'test/app/publication/render-published-cache.spec.ts',
  'test/app/publication/render-published-page.spec.ts',
  'test/app/publication/render-published-refresh.spec.ts',
  'test/app/publication/republish-snippet-pages.spec.ts',
  'test/app/publication/resolve-published-path.spec.ts',
  'test/adapters/admin-preview.spec.ts',
  'test/adapters/asset-repository.spec.ts',
  'test/adapters/crawler-rules.spec.ts',
  'test/adapters/deployment-publication.spec.ts',
  'test/adapters/file-library-projection.spec.ts',
  'test/adapters/file-library-store.spec.ts',
  'test/adapters/file-streaming.spec.ts',
  'test/adapters/image-geometry.spec.ts',
  'test/adapters/image-processing.spec.ts',
  'test/adapters/installation-settings.spec.ts',
  'test/adapters/json-ld-catalog.spec.ts',
  'test/adapters/json-ld-decoder.spec.ts',
  'test/adapters/json-ld-release-projection.spec.ts',
  'test/adapters/media-address-release-build.spec.ts',
  'test/adapters/media-file-types.spec.ts',
  'test/adapters/media-reference-sources.spec.ts',
  'test/adapters/media-reference-updates.spec.ts',
  'test/adapters/media-storage.spec.ts',
  'test/adapters/media-usages.spec.ts',
  'test/adapters/page-release-build.spec.ts',
  'test/adapters/parallel-snippet-contract.spec.ts',
  'test/adapters/parsed-request-plan-cache.spec.ts',
  'test/adapters/public-file-amplification.spec.ts',
  'test/adapters/publication-directory.spec.ts',
  'test/adapters/publication-prepared-styles.spec.ts',
  'test/adapters/publication-source.spec.ts',
  'test/adapters/publication-store.spec.ts',
  'test/adapters/published-artifact.spec.ts',
  'test/adapters/published-plan.spec.ts',
  'test/adapters/published-routing.spec.ts',
  'test/adapters/release-activation.spec.ts',
  'test/adapters/rendering-registry.spec.ts',
  'test/adapters/request-document-cache.spec.ts',
  'test/adapters/routing-release-build.spec.ts',
  'test/adapters/site-asset-directory.spec.ts',
  'test/adapters/site-favicon-store.spec.ts',
  'test/adapters/sitemap.spec.ts',
  'test/adapters/template-variable-rendering.spec.ts',
  'test/adapters/verified-publication-catalog.spec.ts',
  'test/adapters/json-ld-document.spec.ts',
  'test/adapters/admin-document-http.spec.ts',
  'test/adapters/admin-files-http.spec.ts',
  'test/adapters/admin-json-ld-http.spec.ts',
  'test/app/json-ld/json-ld-publication-source.spec.ts',
  'test/app/publication/render-data.spec.ts',
  'test/app/publication/request-cache.spec.ts',
  'test/app/publication/request-cache-refresh.spec.ts',
  'test/adapters/frontend-asset-lifetime.spec.ts',
  'test/adapters/local-preview-recovery.spec.ts',
  'test/adapters/media-inspection-errors.spec.ts',
  'test/adapters/json-ld-inspection.spec.ts',
  'test/app/json-ld/inspect-json-ld-published.spec.ts',
  'test/adapters/frontend-build.spec.ts',
  'test/adapters/frontend-source-resources.spec.ts',
  'test/adapters/named-media-rendering.spec.ts',
  'test/adapters/release-asset-urls.spec.ts',
  'test/adapters/raw-documents.spec.ts',
  'test/adapters/json-ld-reference-ownership.spec.ts',
  'test/adapters/file-streaming-http.spec.ts',
  'test/adapters/file-response-abort.spec.ts',
  'test/adapters/installation-admin-context.spec.ts',
  'test/architecture.spec.ts',
  'test/adapters/cloudflare-deployment.spec.ts',
  'test/adapters/cloudflare-deployment-streaming.spec.ts'
)
npm test -- @unitFiles
```

## Reproducible real integration selections

Use an owned temporary replica set and loopback listener, never owner data.
This review used MongoDB 9.0.8 pinned by the Compose image digest, an auto-removed
tmpfs container labeled for this task, direct connection and an initialized
replica set. Every fixture has separate database/site/storage ownership.
No tracked credentials or local settings were changed. Supply that owned URI
through the process environment (the placeholder below must be replaced).

```powershell
$env:ZARYA_TEST_MONGO_URI = '<owned-loopback-test-replica-set-uri>'
$integrationFiles = @(
  'test/integration/installation-settings.integration.spec.ts',
  'test/integration/json-ld-catalog.integration.spec.ts',
  'test/integration/json-ld-publication.integration.spec.ts',
  'test/integration/media-scheduling.integration.spec.ts',
  'test/integration/media-reconciliation-fence.integration.spec.ts',
  'test/integration/publication.integration.spec.ts',
  'test/integration/admin-publication.integration.spec.ts',
  'test/integration/page-editorial-publication.integration.spec.ts',
  'test/integration/preview-delivery.integration.spec.ts'
)
npm run test:integration -- @integrationFiles
npm run test:integration -- test/integration/file-library.integration.spec.ts -t 'replaces a private favicon|uploads and serves WOFF2|rejects an anonymous|retains originals|isolates identical|serves documents|guards concurrent moves|uploads and replaces the same filename|updates published media|moves variants|runs session-bound|resumes journaled|migrates existing'
npm run test:integration -- test/integration/cloudflare-deployment.integration.spec.ts
```

The 25-case selection covers installation HTTP/settings CAS/cookies, real JSON-LD
catalog/graph and draft-versus-published inspection, scheduled media claims,
reconciliation interleaving, static/Request release activation and failure,
admin editorial publication and real private/raw preview delivery. Publication
integration executes its configured browser checks. The separate Files filter
covers actual upload/original/delivery, font/document/favicons, concurrent mutation,
references, pending journal recovery and offline-layout migration.
Cloudflare integration prepares local output and tests its Worker; it does not
upload or contact Cloudflare.

## Test cleanup and limits

Removed `test/app/publication/published-catalog.spec.ts` (two duplicate catalog
checks), moving its unique next-invocation fresh-active-pointer assertion into
the stronger `find-published-pages.spec.ts`. Kept malformed/foreign/missing batch
cases there. Renamed a misleading file-library-store test to describe the actual
empty owned read it verifies. Codec/enum-data and migration checks that protect an
external representation were retained; they are not test-count filler.

No complete engine, coordinator/fork-drain, every browser/OS, live public-address
probe, production data, dependency advisory scan, external deployment API or full
CMS audit is claimed. No source changes require a new coordinator protocol.
RepublishSnippetPages has executed substantive unit evidence and shared release
adapter integration, without a separate live snippet-update end-to-end claim.
There are no unresolved required checks for the bounded changes; the complete
state marker records closure and the owner-requested commit boundary.
