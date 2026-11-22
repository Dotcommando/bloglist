# Actual verification

2026-11-18; Windows; branch/target `0.15.2`.
Baseline: `318a475b0ffb8c121e8dc6c9efec8e29609b30ba`, the previous review
committed and pushed at the owner's request before starting this one.
New review changes remain uncommitted/unpublished; package metadata is 0.15.1.
See the [audit](../../../audits/0.15.2-addons-calibration-deployment-hooks.md)
for all 38 operations, used adapter methods, threats and limitations.

## Final results

- **288 passed** unit/adapter/composition/architecture tests: 75 passing files,
  one platform-skipped file in the explicit **76-file** manifest below.
- The one skip is the unchanged `resource-helper-security.spec.ts` case for
  production POSIX Unix socket mode and UID/GID. It cannot verify those guarantees
  on Windows. It is retained for Linux, not weakened or counted as passing.
- **26 distinct actual integrations passed** across **15 files**. Repeated
  baseline/focused executions are not added again. No full suite.
- `npm run format`, `npm run lint`, `npm run typecheck` and `npm run build`
  passed. Server TypeScript and Svelte passed (0 errors/0 warnings).
  The build retains its existing informational admin chunk-size advisory.
- Source checks include architecture, clean distribution, provider resolution,
  protected request admission and resource/worker ownership. No package versions,
  dependency lockfiles, schemas or migration checksums changed.
- Documentation checks and removal of owned test resources are recorded in the
  state marker at closure.

## Defect inventory

**12 new confirmed production bugs; 0 new QA bugs; 0 confirmed vulnerabilities.**
Each card contains cause, correction, actual regression and recovery/limits.
The catalogue-placement refactor is a source-reviewed architecture correction,
not a fabricated thirteenth runtime bug.

1. Confirmed bug: [calibration/incomplete-step-evidence](../../../defects/calibration/incomplete-step-evidence.md) - incomplete API-step evidence accepted as a winner.
2. Confirmed bug: [hooks/incomplete-atomic-reorder](../../../defects/hooks/incomplete-atomic-reorder.md) - stale incomplete hook ordering accepted.
3. Confirmed bug: [hooks/known-rejection-blocked-safe-skip](../../../defects/hooks/known-rejection-blocked-safe-skip.md) - known no-effect rejection blocked safe skip.
4. Confirmed bug: [calibration/partial-resource-journal](../../../defects/calibration/partial-resource-journal.md) - failed journal preparation left invalid recovery data.
5. Confirmed bug: [hooks/abort-runtime-failure-hidden](../../../defects/hooks/abort-runtime-failure-hidden.md) - fatal abort failure hidden before host write replay.
6. Confirmed bug: [deployment/backend-probe-used-admin-route](../../../defects/deployment/backend-probe-used-admin-route.md) - healthy backend rejected because /admin/ moved.
7. Confirmed bug: [deployment/resolved-marker-failure-stranded-lock](../../../defects/deployment/resolved-marker-failure-stranded-lock.md) - marker-removal failure stranded the operation lock.
8. Confirmed bug: [addons/invalid-created-runtime-not-disposed](../../../defects/addons/invalid-created-runtime-not-disposed.md) - created invalid runtime omitted its provided disposer.
9. Confirmed bug: [addons/installation-primary-failure-masked](../../../defects/addons/installation-primary-failure-masked.md) - discard replaced the primary installation failure.
10. Confirmed bug: [addons/failed-staging-cleanup-lost-ownership](../../../defects/addons/failed-staging-cleanup-lost-ownership.md) - failed private cleanup lost its retry target.
11. Confirmed bug: [addons/prerequisite-failure-misdiagnosed](../../../defects/addons/prerequisite-failure-misdiagnosed.md) - private prerequisite fault lost its cause and gave false migration advice.
12. Confirmed bug: [hooks/worker-result-abandoned-queries](../../../defects/hooks/worker-result-abandoned-queries.md) - worker result abandoned admitted reads and late failures.

## Executed RED/GREEN and characterization

| Boundary | Actual RED | GREEN / permanent observation |
| --- | --- | --- |
| CAL-STEPS | Empty, page-only or foreign-site step maps returned Completed with a winner | Exact positive site/path evidence required; unmeasured steps fail; measured positive and zero-share controls pass. Actual helper transport/Mongo storage cases persist Failed/no winner or a valid Confirmation as appropriate |
| HOOK-ORDER | Adapter unit and actual competing MongoDB commit both accepted an incomplete ordering | Read complete current set within transaction/session/fence; stale request rejects and preserves both current bindings and prior version |
| HOOK-REJECT | Known rejection persisted OutcomeUnknown; actual no-effect authority rejection could not be skipped | Failed command receipt remains truthful, safe skip settles lane, genuine Unknown controls retained |
| CAL-JOURNAL | Actual partial write plus ENOSPC left calibration-journal.json before a lease/resources changed | Complete exclusive same-directory publication, owned partial removal, unchanged allocation, retry/restore without restart; existing journal remains byte-identical on EEXIST |
| HOOK-ABORT | Supported injected MongoRuntimeError disappeared and a later write replay succeeded | Both causes, one write, no commit/replay and awaited endSession. Pinned driver implementation inspected; no fictitious post-commit leak or real outage asserted |
| DEPLOY-HEALTH | /api/health=200 plus /admin/=404 returned Backend | Correct independent bounded HEAD; actual loopback integration checks healthy/unhealthy status, no provider credentials/cookies and no upload |
| DELIVERY-RELEASE | Marker EACCES left .operation.lock, blocking next pass | Handle/lock cleanup still attempted; restore remains blocked by marker until a fresh successful permit pass; errors preserved |
| ADDON-RUNTIME | Compiled invalid hook/handler runtime recorded opened without close | Provided disposer invoked; no invalid selected runtime/pointer; primary plus disposer failure retained |
| ADDON-PRIMARY | Activation plus discard failure exposed only the latter | Both failures preserved, Pending immutable claim retained, no false completion; existing exact-release/lost-ack tests pass |
| ADDON-STAGING | Next preparation left two real private directories after a cleanup fault cleared | Retained cleanup target removed before next download; one current stage, then none after final discard; preparation and cleanup failures observed |
| ADDON-PREREQUISITES | Verifier EIO lost its cause and became migration-only advice | Existing AddonUnavailable/503 stays fail-closed; private non-enumerable cause retained and false remedy removed |
| HOOK-QUERY-LIFETIME | Real Worker returned allow=true with host read pending; later variant still returned success after that read rejected | Fence messages, request cooperative cancellation, settle all admitted reads/termination; unexpected late error propagates, expected cancellation preserves completed result |

Added authorization/compiler/history/cancellation/scope cases passed before any
corresponding behavioral change and are characterization. All eleven protected
hook operations deny before private reads, compilation or effects; ProcessHookDeliveries
is a trusted executor, not an administrative endpoint. ReadCalibrationRuns history/
detail and Cancel have explicit auth/flush/missing-data/restoration-error evidence.

The old resumed-plan test's title claimed fresh-plan persistence without testing
it. It was corrected and extended: a failed fresh-plan write cannot start a command.
No complete selected test was deleted merely for a weak-looking assertion or name.
Real composition, external representation, immutable dependency/migration and
unknown-effect checks have useful guarantees and were retained.

Architecture baseline: five explicit composition/architecture files passed seven
checks before moving inline ADDON_CATALOG behavior into its outbound adapter.
Post-refactor units exercise current registry changes, unknown keys and the selected
configuration validator; actual catalogue/install/update composition also passed.
There was no fake import-failure RED or new contract/policy/ADR decision.

## Initial prerequisites and failed attempts

- Initial 19-file app baseline: 82 passed. Initial 34-file adapter baseline:
  118 passed once owned loopback/junction operations were allowed. The first
  sandbox run's EACCES/EPERM setup failures are not product or QA bugs.
- The first calibration mkdir/write fault fixture needed an ESM module mock;
  its setup error was corrected before the behavioral ENOSPC RED.
- A mistyped resource-runtime test filename matched no file; it is absent from
  the final existing/unique manifest. Counts include only actual reported tests.
- Type/style checks caught test-fixture readonly-db assignment, inferred never[]
  and line/statement formatting. All were corrected; they are not product findings.
- Live-update prerequisites first lacked ZARYA_TEST_SYNTHETIC_PACKAGES; then old
  external prebuilt artifacts correctly failed the host-dependency guard:
  Mongoose 9.11.2 versus current host 9.11.4. The guard was not relaxed.
- Fresh private copies of the Synthetic source, migrations, builder, package and
  tsconfig were staged under an owned CMS .tmp directory. The staged package and
  build recipe pin Mongoose 9.11.4/SDK 0.5.0 before compilation against the host's
  locked toolchain. The copied source typechecked. Base, Compatible, Exclusive,
  MigrationFailure and MigrationRepair variants were rebuilt; all three live
  updates then passed. Original external files and old installed artifacts were
  not rewritten. The source checkout has no Git revision available; no revision
  provenance is invented.
- No sibling runtime source import, symlink, live service or new product capability
  was added by the private fixture build.

## Exact unit/composition/architecture selection

PowerShell from the repository root:

```powershell
$unitFiles = @(
  'test/app/addon-runtime-assets.spec.ts',
  'test/app/addon-update.spec.ts',
  'test/app/apply-calibration-result.spec.ts',
  'test/app/calibration-budget.spec.ts',
  'test/app/calibration-profile-crud.spec.ts',
  'test/app/calibration-profiles.spec.ts',
  'test/app/calibration-run.spec.ts',
  'test/app/check-deployment.spec.ts',
  'test/app/configure-deployment.spec.ts',
  'test/app/deployment-status.spec.ts',
  'test/app/hook-execution.spec.ts',
  'test/app/hook-recipients.spec.ts',
  'test/app/hooks-configuration.spec.ts',
  'test/app/prepare-addon-update.spec.ts',
  'test/app/process-deployment.spec.ts',
  'test/app/retry-deployment.spec.ts',
  'test/app/addons/install-addon-from-repository.spec.ts',
  'test/app/addons/list-addon-installations.spec.ts',
  'test/app/addons/site-addons.spec.ts',
  'test/adapters/addon-admin-session.spec.ts',
  'test/adapters/addon-calibration-queries.spec.ts',
  'test/adapters/addon-directory-move.spec.ts',
  'test/adapters/addon-installation-store.spec.ts',
  'test/adapters/addon-package-archive.spec.ts',
  'test/adapters/addon-package-builder-compatibility.spec.ts',
  'test/adapters/addon-package-registry-install.spec.ts',
  'test/adapters/addon-route-declarations.spec.ts',
  'test/adapters/addon-runtime-lifecycle.spec.ts',
  'test/adapters/addon-schema-compatibility.spec.ts',
  'test/adapters/addon-shutdown-notification.spec.ts',
  'test/adapters/addon-update-gate.spec.ts',
  'test/adapters/addon-updates-http.spec.ts',
  'test/adapters/admin-addon-installations-http.spec.ts',
  'test/adapters/admin-deployment-http.spec.ts',
  'test/adapters/calibration-page-resolver.spec.ts',
  'test/adapters/calibration-security.spec.ts',
  'test/adapters/cloudflare-command.spec.ts',
  'test/adapters/cloudflare-delivery.spec.ts',
  'test/adapters/cloudflare-deployment-streaming.spec.ts',
  'test/adapters/cloudflare-deployment.spec.ts',
  'test/adapters/cloudflare-worker-bundle.spec.ts',
  'test/adapters/delivery-restore-guard.spec.ts',
  'test/adapters/deployment-catalogue.spec.ts',
  'test/adapters/deployment-inspection.spec.ts',
  'test/adapters/deployment-publication.spec.ts',
  'test/adapters/deployment-store.spec.ts',
  'test/adapters/file-response-abort.spec.ts',
  'test/adapters/github-addon-delivery.spec.ts',
  'test/adapters/hook-addon-recipients.spec.ts',
  'test/adapters/hook-recipient-source.spec.ts',
  'test/adapters/hook-runtime.spec.ts',
  'test/adapters/hook-transaction.spec.ts',
  'test/adapters/site-addon-store.spec.ts',
  'test/app/hooks-boundaries.spec.ts',
  'test/app/calibration-run-boundaries.spec.ts',
  'test/adapters/hook-command-outcomes.spec.ts',
  'test/adapters/hook-configuration-order.spec.ts',
  'test/adapters/registered-addon-catalog.spec.ts',
  'test/adapters/registered-addon-availability.spec.ts',
  'test/adapters/addon-update-resources.spec.ts',
  'test/adapters/calibration-generator.spec.ts',
  'test/adapters/calibration-profile-store.spec.ts',
  'test/adapters/calibration-resource-lease.spec.ts',
  'test/adapters/control-resources-process.spec.ts',
  'test/adapters/installation-resource-runtime.spec.ts',
  'test/adapters/resource-persistence-faults.spec.ts',
  'test/adapters/resource-helper-security.spec.ts',
  'test/infra/hook-worker-invalidation.spec.ts',
  'test/infra/deployment-module.spec.ts',
  'test/infra/deployment-management-module.spec.ts',
  'test/infra/addon-installation-module.spec.ts',
  'test/infra/site-addons-module.spec.ts',
  'test/infra/public-calibration-composition.spec.ts',
  'test/infra/admin-request-admission.spec.ts',
  'test/architecture.spec.ts',
  'test/clean-distribution.spec.ts'
)
npm test -- @unitFiles
```

The Linux-only helper test reports one skip on Windows. Do not reinterpret it as
a passed production permission check. Actual HelperCalibrationLoad HTTP transport,
resource leases, IPC, child generator cancellation and serving-fork workflow did run.

## Exact real integration selections

Supply an owned temporary loopback MongoDB replica-set URI. This review used
MongoDB 9.0.8 with the repository's pinned image digest, tmpfs, task label and
auto-removal, with isolated `zarya_test_*` databases and private site/storage roots.
No owner database, persistent app or Docker quota was modified.

```powershell
$env:ZARYA_TEST_MONGO_URI = '<owned-loopback-test-replica-set-uri>'
$env:ZARYA_TEST_SYNTHETIC_PACKAGES = '<fresh-host-compatible-synthetic-packages-root>'
$mainFiles = @(
  'test/integration/addon-live-updates.integration.spec.ts',
  'test/integration/addon-update-admission.integration.spec.ts',
  'test/integration/repository-addon-installation.integration.spec.ts',
  'test/integration/hook-core-operations.integration.spec.ts',
  'test/integration/hook-boundary-regressions.integration.spec.ts',
  'test/integration/hooks.integration.spec.ts',
  'test/integration/calibration-evidence.integration.spec.ts',
  'test/integration/deployment-store.integration.spec.ts',
  'test/integration/deployment-http.integration.spec.ts'
)
npm run test:integration -- @mainFiles
$remainingFiles = @(
  'test/integration/hooks-schema.integration.spec.ts',
  'test/integration/calibration-profiles.integration.spec.ts',
  'test/integration/site-addons.integration.spec.ts',
  'test/integration/calibration-availability.integration.spec.ts'
)
npm run test:integration -- @remainingFiles
npm run test:integration -- test/integration/calibration-workflow.integration.spec.ts
npm run test:integration -- test/integration/deployment-backend-health.integration.spec.ts
```

Actual execution was incremental: the main selection's eight non-live-update
files passed 15 scenarios; the three live updates subsequently passed with rebuilt
fixtures. Remaining four files passed six; workflow one; backend-health one.
Thus **18 + 6 + 1 + 1 = 26 distinct passing integrations**.
Existing .env provided the explicit test Chromium executable; no private
configuration value is retained here.

| Actual file | Passed | Scope |
| --- | ---: | --- |
| addon-live-updates | 3 | Real Synthetic schema/code selection, admission, serving traffic, forced drain and failed-migration/higher-version repair; configured browser workflow |
| addon-update-admission | 1 | Actual update upload admission before body/work |
| repository-addon-installation | 3 | Real unique immutable claims, auth/site rejection, catalogue/install UI, no auto-enable and restart |
| hook-core-operations | 1 | Actual denied source and permitted command with atomic source receipt |
| hook-boundary-regressions | 2 | Current complete ordering race; compiled command rejection with no effect, safe skip and settled lane |
| hooks | 1 | Actual source commit/rollback, frozen versions, ordering, disable/resume, uncertain receipt and independent lanes |
| calibration-evidence | 2 | Actual helper transport/Mongo records, controlled telemetry/quota peer, complete versus missing API evidence |
| deployment-store | 3 | Actual migration/CAS/ownership/recovery persistence |
| deployment-http | 2 | Actual session/dispatcher, scoped configuration/status/check/retry and unfinished anonymous body |
| hooks-schema | 1 | Real validators and unique delivery/version constraints |
| calibration-profiles | 1 | Real profile version guards, zero shares, soft deletion and retained history |
| site-addons | 3 | Clean empty catalogue/schemas, actual bilingual browser empty state and unavailable retained metadata |
| calibration-availability | 1 | Actual observed-prerequisite/error/recovery status composition |
| calibration-workflow | 1 | Real serving forks/HTTP/browser, controlled quota helper, restoration, retained history and explicit apply |
| deployment-backend-health | 1 | Actual owned loopback HEAD, moved/absent fixed admin route, safe unhealthy result and no provider credentials |

## Limits and closure

No full suite, exhaustive multi-fault combinations, all browsers/OSes, production
data, final Linux image/cgroup recalibration, dependency advisory scan, live GitHub
release access, external Cloudflare upload or complete VM/engine/coordinator audit.
No security exploitation or capacity benchmark is claimed. Quota/provider peers
are controlled where listed. The unchanged POSIX helper permission case remains
a platform exclusion, not a hidden required changed-boundary failure.

Final resource/documentation results live in the single dossier state marker.
Required scope checks passed; the new review remains uncommitted for owner review.
