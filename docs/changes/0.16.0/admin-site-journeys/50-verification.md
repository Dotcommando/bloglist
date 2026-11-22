# Verification

Working tree based on master 8a5e693; target 0.16.0.

- Initial source typecheck: `npm run typecheck:server` passed.
- Restricted initial browser run could not connect to isolated MongoDB (EACCES).
  This was an environment failure, not a behavioral RED. The same exact selected
  test runs with local network/browser permission.
- Journey characterization reached actual site/page/source creation and both
  Original/Responsive uploads. Test-development corrections included selecting
  the real treeitem role and excluding `/sites/new` from navigation waits.
- Behavioral RED: direct navigation to the real TV section returned HTTP 404;
  `admin-site-journey.integration.spec.ts` failed on `/template-variables`.
  The server shell route allowlist omits that supported client section.
- Focused adapter RED: `npm test -- test/adapters/admin-document-http.spec.ts
  -t "TV workspace deep link"` failed with expected 200 / actual 404, before the
  route correction. Real HTTP listener, no mocked route matcher.
- Adapter GREEN: all six `admin-document-http.spec.ts` cases passed.
- Connected real browser journey GREEN: 1 passed, 40.87s command time / 34.27s
  test time. Includes first page, template/chunk/two Snippets, actual uploaded
  responsive/single TV images selected at 375/1440, SEO/OG edits, noindex/sitemap,
  favicon bytes, nested virtual folder materialization and both URL move modes.
- Additional browser RED: `admin-rendering-ui.integration.spec.ts -t "focuses
  the invalid field"` failed because focus remained outside the invalid title
  after mobile More -> Save draft. The Main tab opens but the popover traps focus.
- Mobile focus GREEN: the focused regression and complete TV interaction case
  passed together (2 passed) after closing the popover and handing focus to the
  invalid field without the default trigger-focus restoration.
- Files RED: the independently seeded real Files UI scenario saved a renamed
  image but reset the user's pending Folder selection to empty. The assertion
  expected its own Photos folder ID and received an empty string. Existing
  independent Save name / Save folder controls must preserve the other draft.

## Defect inventory

| ID | Kind | Discovery | Card | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| [admin/template-variables-deep-link-missing](../../../defects/admin/template-variables-deep-link-missing.md) | Bug | Newly discovered | New | Fixed | Real journey and six HTTP adapter cases passed |
| [admin/mobile-draft-validation-focus](../../../defects/admin/mobile-draft-validation-focus.md) | Bug | Newly discovered | New | Fixed | Focused browser case plus TV suite passed |
| [admin/file-organization-draft-reset](../../../defects/admin/file-organization-draft-reset.md) | Bug | Newly discovered | New | Fixed | Independently seeded real Files UI case passed, 18.71s command time |
| [qa/admin-release-fixture-drift](../../../defects/qa/admin-release-fixture-drift.md) | Bug | Newly discovered | New | Fixed | Complete 113-case selection passed without skips/unhandled errors |
| [qa/system-document-fixture-assumptions](../../../defects/qa/system-document-fixture-assumptions.md) | Bug | Previously known, rediscovered | Reused/updated | Fixed | Pagination setup and URL suite passed with actual system release |
| [qa/media-tests-selected-unrelated-resources](../../../defects/qa/media-tests-selected-unrelated-resources.md) | Bug | Previously known, rediscovered | Reused/updated | Fixed | Standalone Files UI case owns all tested resources and passed |

Known favicon bugs from 0.15.3 are preserved regression scope, not new discoveries.
New distinct defects: 4 bugs, 0 vulnerabilities; 4 new cards. Two additional known
QA mechanisms were rediscovered and their existing cards updated, not duplicated.

## Bounded release selections

- Initial selection (connected journey excluded during development): 15 failed,
  91 passed, 5 skipped, 11 unhandled fixture errors. This failed truthfully.
- Two-worker full selection after corrections: 112 passed, 1 failed, 0 skipped,
  no unhandled errors; 182.59s Vitest time. The remaining Files failure was its
  obsolete final navigation expectation; the stronger owned-file deletion check
  and current mobile navigation pass in the subsequent standalone case.
- Source checks: `npm run format` passed; `npm run lint` passed; `npm run typecheck`
  passed with zero Svelte errors/warnings. `npm run build` passed in the release
  command (existing bundle-size advisory only).
- Final unfiltered selection: `npm run test:release:admin -- --maxWorkers=4`:
  **14 files / 113 tests passed**, zero skips, zero unhandled errors. Vitest time
  **107.18s**; complete build-and-test command **119.2s**. Windows host with
  20 available logical CPUs, isolated real MongoDB, configured headless Edge.
  Build completed once in 11.51s. The default is now capped at four workers,
  matching this tested budget; lower budgets remain an explicit CLI choice.
- `npm test -- test/architecture.spec.ts test/clean-distribution.spec.ts
  test/adapters/admin-document-http.spec.ts`: **11 passed**.
- Final `npm run format`, `npm run lint`, `npm run typecheck`: passed after the
  last fixture/configuration edits; Svelte reports zero errors/warnings. No new
  runtime product edits after the passing gate.
- `node --check scripts/test-admin-release.mjs`: passed. `git diff --check`:
  passed, including preservation of the URL test file's original mixed line endings
  outside the changed lines. Documentation check: 22 Markdown files and 156
  relative file links resolve. Final JSON report independently reports success,
  113 passed / 0 failed / 0 pending in 14 files.

No remaining required checks for the original increment. Automated Windows/Chromium
evidence is recorded above; no separate manual Safari check or release deployment
was performed or claimed. These changes do not redesign controls or packaging.

## Coverage-gap follow-up at 084c36b

Branch 0.16.0, Windows/headless Edge, explicitly configured isolated MongoDB.
The previous results above remain historical. Current follow-up final checks
are pending until recorded below. Matrix: [coverage review](70-coverage-gaps.md).

- Array-item type RED: selected `round-trips nested` cases failed in both
  Template and Chunk after selecting Enum; the item values control never
  appeared. Source inspection confirms replacement mutated the temporary array
  returned by the function binding. No production edits preceded this failure.
  GREEN after assigning the complete fields array: six selected document/
  parameter/Snippet cases passed in 5.54s. Typed item defaults also round-trip.
- Additional characterization: malformed JSON Object/Array defaults block
  submission locally and valid corrected contracts retain zero/false values.
  Eight selected editor cases passed together before the later JSON-LD expansion.
- TV default accessible-name RED: complete existing TV UI test expected one
  Game image button, received zero. Real journey also could not find Default
  photo; trace confirms duplicate `tv-default-label` heading/control IDs.
  GREEN after distinct heading ID: complete existing TV case passed (3.86s).
- Real URL journey passed: occupied-path refusal, retained input, navigation
  confirmation and child promotion without redirects.
- Real Files and metadata journeys passed together (14.51s and 21.10s under
  three-worker load): partial upload recovery, replacement, download/clipboard,
  independent sitemap exclusion and clearing metadata overrides.
- Real TV conflict scenario passed (9.06s): actual 409, retained losing input,
  winning catalog read and explicit reload.
- Test-development failures included ambiguous folder buttons, a collapsed
  folder, unsupported synthetic TXT extension, immediate post-reload counts,
  a robots whitespace expectation and waiting for publish instead of the earlier
  publication-assignment rejection. These are test corrections, not product RED.
- Including the existing hierarchy suite exposed known QA fixture drift:
  2 file-heading failures and 30 unhandled background-read rejections. Updated
  explicit addon/TV reads and current Rename file heading names in that fixture;
  reused its existing QA record. No arbitrary catch-all success was added.
- Initial format identified missing helper return types/long lines; corrected.
  `npm run typecheck` passed with zero Svelte errors/warnings after both UI fixes.

New follow-up production findings: 2 bugs, 0 vulnerabilities; 2 new canonical
cards: [array item binding](../../../defects/admin/array-item-parameter-kind-lost.md)
and [TV default label collision](../../../defects/admin/tv-default-label-collision.md).
One known QA mechanism reused, not a new card. Final verification pending.

- Expanded selected run: 75/75 passed (61 editor, 12 hierarchy, 2 real TV).
  Complete existing hierarchy assertions pass after explicit fixture corrections.
- First full expanded gate: 19 files, 139 passed / 1 failed, no skips/unhandled
  errors, 105.92s tests. All 15 new cases and 12 newly selected hierarchy cases
  passed. Existing URLs fixture received 409 instead of 201 during page setup.
  Standalone URLs rerun with response-body diagnostics passed 8/8 (58.84s command).
  Its transactional hook recording shares scope writes with background dispatch,
  consistent with the known Snippets fixture contention. Disable only unrelated
  background work in this existing bulk fixture; actual new browser journeys
  retain normal work. No retry or production concurrency change was introduced.
- `npm run format` and `npm run lint`: passed before that final fixture edit.
  Five architecture/distribution cases passed. Documentation: 17 Markdown files,
  129 relative links resolved; final text updates still need a final link check.
- Second expanded full run: 139/140 passed, with the old URLs fixture now green.
  The new TV removal/reload assertion used Vitest's short default polling budget;
  trace shows the removal POST returned 200 with exactly three fields, then the
  reload's catalog GET was still pending when polling expired. Replace this
  assertion timing with the actual first-row visibility wait using the journey's
  10-second action budget before counting rows. No product change or retry.

## Final follow-up verification

- `npm run test:release:admin`: **19 files / 140 cases passed**, zero skipped,
  zero failed and no unhandled errors. Four workers, no retries. Vitest **108.21s**;
  total build-and-test **118.9s**, single build **10.19s**. This adds 15 new cases
  and includes 12 existing hierarchy cases compared with the 113-case baseline;
  timings are comparable on this Windows host, not a promise for other hosts.
- Real TV file: 2/2 passed in 32.32s, main lifecycle 23.45s and competing editors
  8.87s. Original real fresh-site journey passed in 38.76s; new metadata/URLs/Files
  journeys passed in 18.27s/19.04s/11.39s respectively. Files own storage and run
  concurrently; dependent actions remain sequential.
- Final `npm run lint` and `npm run typecheck` passed (zero Svelte errors/warnings).
  The final wait-only TV assertion correction and URLs fixture also passed scoped
  ESLint. Earlier `npm run format` passed; final diff whitespace check passed.
- `npm test -- test/architecture.spec.ts test/clean-distribution.spec.ts`: 5 passed.
  No backend behavior was changed, so no artificial backend unit RED was added.
  Both production fixes have observed built-UI RED/GREEN; shared entry points
  inspected, no further production refactor needed.
- Original mixed URL fixture line endings restored outside its three edited
  lines; source text unchanged. No unrelated line-ending rewrite is included.
- Final documentation check: 17 Markdown files / 129 relative links resolve.
  JSON report independently confirms success, 140 passed, 0 failed, 0 pending,
  19 files. Final Git whitespace check passed.

Follow-up defect inventory: **2 new bugs, 0 confirmed vulnerabilities, 2 new
cards, both fixed**. Existing QA fixture drift reused/updated (1 known mechanism),
no duplicate QA card. The earlier four-defect inventory is history of the previous
increment, not an additional discovery in this follow-up. All requested coverage
and required checks are complete. No release packaging/deployment or persistent
owner application/dependency operation performed.

## Second continuation: all explicitly listed remaining scenarios

Baseline f5f09c7, branch 0.16.0, initially clean. Owner explicitly authorized all
N01-N21 cases, fixes and commit. [Matrix and exact executable files](80-remaining-scenarios.md).
No new production behavior has been changed in this continuation.

Selected real-browser results:

- Page details: 3/3 passed (manual order/OG, Request caching, additional language).
- Elements runtime: 3/3 passed; later repeated with nullable default consumed by
  actual Build/Request output, 52.30s file time under two-worker load. Corrected
  browser TypeScript runs in the published page for both Template and Chunk.
- TV interactions and media mutations: 7/7 passed together, 68.17s Vitest time /
  79.4s with one build. Real stale media uses an actual Image value/reference;
  Text-only TV changes legitimately do not require the media-version fence.
- Routing rejections: 2/2 passed, including a second stale picker's actual cycle
  refusal. The server also rejects the invalid full URL; no native input pattern
  is claimed. A pending suggestion list remains visible until refreshed, so wait
  for the new response before asserting forbidden-option absence.
- Content recovery: 5/5 passed in 72.22s; real source/runtime cases passed in the
  same batch (8/8, 83.34s Vitest / 96.3s including build).
- File/URL recovery: 2/2 passed with all four failure modes and real recovery.
- Source typecheck passed with zero Svelte errors/warnings; format and lint passed
  before the final locale-scope/wait-only edits. Five architecture/distribution
  cases passed. Final source and document checks are recorded after the gate.

Test-development corrections (not product RED): exact title selection instead of
substring A matching sitemap; select the new parent folder explicitly; file-folder
options contain full paths; use allowed nonreserved snippet aliases; use the real
apply-success message; configure additional languages through the existing local
port because no POST update endpoint exists; disabled cache omits the diagnostic
header. Timeout controls expire the targeted signal and let the browser cancel
the held route once; do not abort an already handled route. A valid expired
session must keep expiresAt after createdAt rather than create invalid stored
intervals. After login, return to the requested editor rather than assume the site
overview is the return route.

First complete six-worker run: 28 files, 150 passed / 14 failed, no skips or
unhandled rejections, 197.91s Vitest. Thirteen failures were newly observed errors
from the test locale script on opaque blank child pages; one existing URL poll
expired too early. Scoped the script and aligned that poll with the existing
browser budget, preserving all assertions and all-page error observation.
Known QA mechanisms reused: fixture drift and selection of unrelated resources.
No new canonical defect card and no confirmed new production bug/vulnerability.

Final unfiltered gate verification is in progress; previous counts above are
history until the final result is appended. No automatic retries were enabled.

The corrected full six-worker run passed all 164 cases in 28 files: 202.61s
Vitest / 213.9s including one 10.76s build. The optional four-worker comparison
subsequently had 161/164 passing (247.98s): old publication setup returned 409,
old Files address-switch delivery returned 404, and one routing journey timed out
at 90s without a more specific failure. The routing file passed both scenarios
in 37.20s in the next selected run. For the old fixtures, disable unrelated
background work from startup and remove the now-redundant explicit hook-worker
shutdown. The selected run passed publication/onboarding/routing; its remaining
failure was that redundant shutdown against an absent provider, now removed.
This is recorded as fixture maintenance, without a new CMS defect claim.
Final unfiltered verification after that change is in progress.

## Final second-continuation verification

- Final unfiltered `npm run test:release:admin`: **164/164 cases, 28/28 files
  passed**, no failed/pending assertions or unhandled errors. Six parallel files
  at most; zero retries. **199.61s Vitest / 211.0s including one 10.86s build**
  on the configured 20-CPU Windows/headless Edge host. JSON independently checked.
  Both adjusted old fixtures and all 22 new real-browser cases passed.
- Full lint and format passed during development; final changed existing fixtures
  and config passed scoped ESLint. Final full typecheck passed with zero Svelte
  errors/warnings; removing the redundant worker lookup/import afterward also
  passed ESLint and the complete build/gate. Five architecture/distribution
  checks passed. Git whitespace and final relative-document-link checks pass.
- Added seven real-browser files (22 cases), selected two existing real TV/cache
  cases and retained all prior 140 checks. All N01-N21 acceptance points have an
  executable mapping. Faults cover seven editors with actual storage/public
  outcomes, explicit reconciliation and no automatic replay.
- Second-continuation inventory: **0 newly confirmed CMS bugs, 0 confirmed
  vulnerabilities, 0 new canonical cards**. Two existing QA mechanisms reused:
  fixture drift/isolation and selection of unrelated resources. Prior product
  fixes/counts above remain separate historical increments.

All owner-enumerated remaining scenarios and required verification are complete.
Commit authorized to branch 0.16.0. No persistent owner app/dependency service,
release packaging, deployment or remote push was operated.
