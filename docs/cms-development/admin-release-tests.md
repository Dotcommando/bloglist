# Local administration release tests

[Русская версия](admin-release-tests.ru.md)

Run once on the candidate source before each minor release:

```sh
npm run test:release:admin
```

Use the repository-pinned Node/npm and installed dependencies (`npm ci`). Configure
`ZARYA_TEST_MONGO_URI` for an explicitly designated transaction-capable test MongoDB
and `ZARYA_TEST_BROWSER_EXECUTABLE` for an installed Chrome/Chromium/Edge executable
in the environment or local `.env`. Missing prerequisites fail the command.
Set `ZARYA_TEST_SYNTHETIC_PACKAGES` to the directory containing the prebuilt
Synthetic add-on packages used by the live-update scenarios (0.2.0 through 0.3.2).
The command does not start a database or the owner's persistent application.

The runner builds backend and admin once, then uses the existing Vitest and
playwright-core stack with headless Chromium. Independent specification files run
in up to four workers by default; dependent steps within a file remain sequential. To
compare a different local worker budget:

```sh
npm run test:release:admin -- --maxWorkers=2
```

Each real-composition file owns its database/temporary storage/listener. The fresh
site journey provisions only its initial administrator directly; site, page,
template, chunks, Snippets, image uploads and TV assignments are created through
the built UI. Public DOM, image loading, favicon bytes, sitemap and redirect
responses verify the resulting site. Existing focused suites additionally cover
forms, keyboard/focus, responsive layouts, errors, cancellation, optimistic
conflicts, source backups/previews, file replacement/movement and native pagination.
Some focused UI suites use deterministic HTTP fixtures; those prove interactions,
while the connected journey and real HTTP suites prove actual composition.

Additional real journeys cover every [remaining scenario N01-N21](../changes/0.16.0/admin-site-journeys/80-remaining-scenarios.md):
manual ordering and language, actual nested/nullable contracts and Build/Request
Snippet execution, compilation failure/correction, TV reassignment and stale
catalog/media, document/responsive replacement, nested folders, competing file
editors, invalid/colliding URL moves and a stale redirect picker. Recovery in all
seven editors covers a disconnect before admission, expiration of a held request's
signal, a real commit followed by loss of its response, and actual session expiry.
Every case verifies real unchanged/committed state and explicit recovery.

The journey fixture disables unrelated background delivery; editorial operations,
transactions, compilation, media processing and release activation remain real.
Only Request-delivery/additional-language setup uses trusted local composition
because those controls are absent from these workspaces. All tested mutations
go through UI. Controlled timeout expiration avoids sleeping for 15–120 seconds;
it tests timeout handling, not measurement of the configured wall-clock deadline.

The explicit selection is in [vitest.config.admin-release.ts](../../vitest.config.admin-release.ts).
It covers Pages, Templates, Chunks, Snippets, TVs, Files and URLs. It is a bounded
administration gate, not a claim of exhaustive product/security verification.
General integration and unit suites keep their existing execution policies.

The [coverage-gap review](../changes/0.16.0/admin-site-journeys/70-coverage-gaps.md)
maps the follow-up checks to controls: nested and nullable parameter/default
contracts, Snippet phases/cache/result contracts, readonly saved/public
Markdown/JSON-LD, all TV types/defaults and competing writers, partial upload
recovery/replacement/download, independent sitemap exclusion and cleared SEO/OG,
occupied URL recovery and children promotion without redirects. Desktop/mobile
hierarchy-selection checks are included in the same explicit command.

The JSON report is `.tmp/admin-release-results/report.json`, with individual
durations and failures. A failed connected journey also saves a Playwright trace
as `.tmp/admin-release-results/zarya_test_*.zip`. These local ignored artifacts can
contain synthetic session state; review them locally and do not commit them.
On the development Windows host (20 available logical CPUs), the expanded
164-case/28-file selection passed with six workers in 199.61s, or 211.0s including the
single build. Final candidate evidence is maintained in the
[verification dossier](../changes/0.16.0/admin-site-journeys/50-verification.md). This is a measured reference, not a runtime promise for other hosts.
For example, open a failed trace using the installed Playwright CLI:

```sh
node node_modules/playwright-core/cli.js show-trace .tmp/admin-release-results/TRACE.zip
```

No automatic retries mask a failed test. After fixing a failure, rerun its selected
file while developing and complete the unfiltered gate on the final candidate.
The runner forwards Vitest filters/options for diagnosis; a filtered run does not
constitute the complete minor-release gate. Keep the final report with release QA
evidence. Release packaging/publication remains a separate authorized operation.
