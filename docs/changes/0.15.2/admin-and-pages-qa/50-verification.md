# Verification and defect inventory

Date: 2026-11-18. Baseline: `36677c776efa24dad8e846b56d839fe4b1b0d524`.
Exact branch `0.15.2`; initial tree clean. Git branch creation required authorized
sandbox escalation. No destructive Git operation, release or deployment.
Package metadata stays 0.15.1; 0.15.2 here is the requested target branch/release.

## Final results

| Check | Observed result |
| --- | --- |
| Explicit 54-file unit/adapter/composition/architecture run | 176 passed, 0 failed |
| Explicit 8-file real integration run | 43 passed, 0 failed/skipped |
| Core/site-editing filter below | 4 passed, 13 outside-filter tests excluded |
| Public-delivery filter below | 3 passed, 11 outside-filter tests excluded |
| npm run format, then npm run lint | Passed |
| npm run typecheck | Passed server and admin; Svelte 0 errors/0 warnings |
| npm run build | Passed; existing informational >500 kB chunk warning |
| Documentation links/anchors/consistency, whitespace | Passed: 28 changed/new Markdown files, 194 relative links/anchors; one state marker and 10 cards; git diff --check clean |
| Owned test resources | Mongo container stopped and confirmed auto-removed; test-created shared-root artifact residue identified/removed; older unrelated .tmp content preserved |

Selected total: **226 passing scenarios**, including **50 real integrations**.
Filtered-out cases are intentional scope exclusions, not hidden failures.
The full suite was not run.

## Prerequisites and isolation

Node v26.7.0 and installed pinned dependencies. Explicit private .env browser
configuration was used by actual cookie/static-export browser checks; no settings
or credentials are copied here. Restricted loopback produced EACCES; the affected
HTTP/integration runs succeeded with authorized local-network access. That initial
environment failure is not classified as a vulnerability.

The original explicit test Mongo target was unavailable. This task created a
private Docker MongoDB 9.0.8 replica set: name zarya-test-0152-qa, label
zarya.task=0152-qa, --rm, tmpfs, no owner data mount, pinned image digest
1444adda2e4b8d6a0d7f242a625d834a78d6e3aa6e4ed1b0b4c2dab2318c5e3d.
Tests overrode ZARYA_TEST_MONGO_URI per process to that temporary loopback endpoint,
used guarded random zarya_test_<32 hex> databases and private fixture roots, and
closed their resources. Container ID/label/auto-remove were checked before stop;
docker ps -a confirmed its removal.

The reproduced old default-root fixture left only this run's five synthetic-domain
directories under artifacts/sites. Before removal, the absolute workspace target,
complete child allowlist, creation window, absence of tracked files and absence
of reparse points were checked. No shared/owner installation was reset.

## Executed baseline and RED/GREEN evidence

- Baseline: 23 application files, 72 passed; selected non-HTTP adapters passed.
  Initial HTTP network denial exposed unobserved test requests, then the normal
  selected HTTP run passed 12 tests.
- Baseline real auth/users run: 24 passed, 1 failed on obsolete ten-at-once login
  assumptions. Five concurrent pairs preserve the real lost-update/counter test;
  focused rerun and final auth batch pass.
- Baseline page adapter selection: 17 passed, but the repository creation helper
  tested its own insert implementation. That useless case was removed. Its
  duplicate-error test was redirected to the actual repository update branch:
  RED received raw code-11000 Error instead of PageConflictError; await inside
  try/catch made it GREEN, with unknown-outcome/no-retry assertions retained.
- Archive/move: real MongoDB absent MIME/exclusion cases both failed with
  PageConflictError. Corresponding adapter capture-filter units were executed
  failing before the production change. Reusing pageCapture made both units and
  both integrations pass; actual concurrent title edits still conflict.
- Publication/hook baseline: 4 passed, 8 failed on current system setup, artifact
  paths and metadata expectations. Repeated hook fixture exposed shared filesystem
  ownership collision. Corrected real publication (11) and hook (1) cases pass.
- Core tree/archive selected RED: numbers 4/5/6/7 versus old 1/2/3/4 and page count
  4 versus old 1. Correct setup-aware numbers and scoped archive count pass while
  cycle, stale-write, immutable identity and preserved content checks remain.
- First broad selected 54-file run: 160 passed, 16 failed. Fifteen dispatcher
  cases failed in unrelated optional telemetry; one provider-override content
  case timed out on an undeclared real page read. Focused corrections passed,
  then the final same 54-file selection passed all 176.
- New characterization/failure coverage: auth 7, users 8, page publication/restore
  11, auth-record adapter 3 passed. They strengthen known boundaries without
  claiming a previously reproduced production defect.
- No production refactor beyond the two minimal fixes was needed. Nearby and
  integration regressions passed afterward. Formatter/lint diagnostics in new
  fixtures were resolved before final lint/typecheck/build.

## Exact final test selection

Run from repository root with normal local loopback access. This explicit
PowerShell list is the executed unit selection:

```powershell
$files = @(
  'test/app/admin-auth/get-current-admin-user.spec.ts'
  'test/app/admin-auth/list-admin-auth-sessions.spec.ts'
  'test/app/admin-auth/login-admin-user.spec.ts'
  'test/app/admin-auth/logout-admin-user.spec.ts'
  'test/app/admin-auth/revoke-admin-auth-session.spec.ts'
  'test/app/admin-users/block-admin-user.spec.ts'
  'test/app/admin-users/create-admin-user-from-console.spec.ts'
  'test/app/admin-users/delete-admin-user.spec.ts'
  'test/app/admin-users/get-admin-user.spec.ts'
  'test/app/admin-users/list-admin-users.spec.ts'
  'test/app/admin-users/update-admin-user.spec.ts'
  'test/app/pages/archive-page.spec.ts'
  'test/app/pages/configure-page-rendering.spec.ts'
  'test/app/pages/create-page.spec.ts'
  'test/app/pages/get-page-editorial-states.spec.ts'
  'test/app/pages/get-page.spec.ts'
  'test/app/pages/list-pages.spec.ts'
  'test/app/pages/move-page.spec.ts'
  'test/app/pages/publish-page.spec.ts'
  'test/app/pages/restore-page-version.spec.ts'
  'test/app/pages/rewrite-page-media-references.spec.ts'
  'test/app/pages/update-page.spec.ts'
  'test/app/pages/update-request-cache.spec.ts'
  'test/adapters/admin-auth-store.spec.ts'
  'test/adapters/admin-user-store.spec.ts'
  'test/adapters/admin-auth-migration.spec.ts'
  'test/adapters/admin-user-migration.spec.ts'
  'test/adapters/admin-auth-values.spec.ts'
  'test/adapters/admin-password.spec.ts'
  'test/adapters/admin-auth-http.spec.ts'
  'test/adapters/admin-users-http.spec.ts'
  'test/adapters/session-admin-user-access.spec.ts'
  'test/app/admin-auth/failure-atomicity.spec.ts'
  'test/app/admin-users/failure-boundaries.spec.ts'
  'test/app/pages/publication-boundaries.spec.ts'
  'test/adapters/admin-auth-records.spec.ts'
  'test/adapters/pages.spec.ts'
  'test/adapters/page-archival.spec.ts'
  'test/adapters/page-tree-store.spec.ts'
  'test/adapters/page-creation-numbers.spec.ts'
  'test/adapters/page-publication.spec.ts'
  'test/adapters/restore-page.spec.ts'
  'test/adapters/admin-content-http.spec.ts'
  'test/adapters/admin-content-parser.spec.ts'
  'test/adapters/admin-publication-http.spec.ts'
  'test/adapters/admin-login-pressure.spec.ts'
  'test/adapters/admin-user-access.spec.ts'
  'test/adapters/admin-user-cli.spec.ts'
  'test/infra/admin-auth-module.spec.ts'
  'test/infra/admin-users-module.spec.ts'
  'test/infra/admin-content-module.spec.ts'
  'test/infra/admin-request-admission.spec.ts'
  'test/infra/admin-console-composition.spec.ts'
  'test/architecture.spec.ts'
)
npm test -- @files
```

For real integration, explicitly set ZARYA_TEST_MONGO_URI to a private,
transaction-capable test server first; no production/default endpoint is selected.
The final eight-file command was:

```powershell
$files = @(
  'test/integration/admin-auth.integration.spec.ts'
  'test/integration/admin-users.integration.spec.ts'
  'test/integration/admin-users-http.integration.spec.ts'
  'test/integration/publication.integration.spec.ts'
  'test/integration/hook-core-operations.integration.spec.ts'
  'test/integration/page-snapshot-defaults.integration.spec.ts'
  'test/integration/page-editorial-publication.integration.spec.ts'
  'test/integration/crawler-documents.integration.spec.ts'
)
npm run test:integration -- @files
npm run test:integration -- test/integration/core.integration.spec.ts test/integration/site-editing.integration.spec.ts -t 'allows page marks|round-trips rendering|allocates immutable|archives only the page'
npm run test:integration -- test/integration/public-delivery.integration.spec.ts -t 'lists all owned pages|restores all three positions|rolls back the tentative draft'
```

## Defect inventory

**10 new confirmed bug cards, all fixed; 0 vulnerabilities.**
Two production adapter bugs, eight QA bugs. No historical cards imported/recounted.

1. **Bug (production)**: [pages/optional-document-default-guards](../../../defects/pages/optional-document-default-guards.md) — Optional document defaults rejected by captured-state guards.
2. **Bug (production)**: [pages/async-save-error-translation](../../../defects/pages/async-save-error-translation.md) — Asynchronous page-save errors bypassed adapter translation.
3. **Bug (QA)**: [qa/login-admission-counter-assumptions](../../../defects/qa/login-admission-counter-assumptions.md) — Login counter integration exceeded its own admission budget.
4. **Bug (QA)**: [qa/unobserved-parallel-http-requests](../../../defects/qa/unobserved-parallel-http-requests.md) — Concurrent HTTP test left sibling request rejections unobserved.
5. **Bug (QA)**: [qa/system-document-fixture-assumptions](../../../defects/qa/system-document-fixture-assumptions.md) — Page fixtures assumed new sites contained no system documents.
6. **Bug (QA)**: [qa/publication-artifact-directory](../../../defects/qa/publication-artifact-directory.md) — Publication fixtures read the former site-mark artifact directory.
7. **Bug (QA)**: [qa/resolved-document-metadata-expectations](../../../defects/qa/resolved-document-metadata-expectations.md) — Delivery expectations omitted current document metadata.
8. **Bug (QA)**: [qa/implicit-shared-artifact-storage](../../../defects/qa/implicit-shared-artifact-storage.md) — Integration fixtures isolated MongoDB but reused shared artifact storage.
9. **Bug (QA)**: [qa/missing-editorial-outbound-override](../../../defects/qa/missing-editorial-outbound-override.md) — Composition fixture left an editorial page read bound to MongoDB.
10. **Bug (QA)**: [qa/optional-telemetry-admission-fixture](../../../defects/qa/optional-telemetry-admission-fixture.md) — Admission fixture failed in optional telemetry before reaching authorization.

Each card carries its observed failure, correction, regression and prevention
route. [Bounded audit](../../../audits/0.15.2-admin-auth-users-pages.md) owns the
per-operation/method assessment and limits. No supported post-commit ClientSession
leak was established; no fictional vulnerability or operator notification was added.
