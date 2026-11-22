# Verification

- The unfiltered run on the original working tree failed 21 existing cases.
  The [coverage dossier](../release-authorization-coverage/50-verification.md#full-release-run)
  records that run and the reduced-worker repeat.
- `npm run test:integration -- test/integration/rendering-elements.integration.spec.ts -t "creates distinct numbered entities concurrently"`
  returned 409 instead of 201. Diagnostic instrumentation observed MongoDB
  write conflict 112 before commit on the third attempt. The instrumentation
  was removed.
- `npm test -- test/adapters/element-store.spec.ts -t "repeated aborted database write conflicts"`
  reproduced `StaleWrite` after three aborted inserts. The test requires the
  fourth attempt to persist the entity and record its fact exactly once.
- The first browser follow-up recovered 19 of the original 21 failures. It
  exposed one more unscoped TV page-title selector in addition to the
  outstanding creation conflict. Both corrections are included in final checks.
- The first creation fix produced all eight 201 responses and exposed a
  missing file backup under the same concurrent workload. The file and
  metadata assertions required recovery at the backup acquisition boundary.
- `npm test -- test/adapters/element-store.spec.ts -t "retries backup acquisition conflicts"`
  reproduced the raw write conflict during lock acquisition. After the fix,
  all ten selected element storage, hook transaction and architecture checks
  passed. The backup unit test also proves a started file write cannot replay.
- The corrected TV, nested-folder and page-order scenarios passed in the
  focused gate. The complete rendering integration file then passed 10/10,
  including eight ready backups and the independent stale-edit conflict.
- The first unfiltered run after the behavior fixes passed 194/196. The two
  failures were the 90-second deadlines for the manual page-order and URL
  child-promotion journeys. The repeat limits the release configuration to
  four simultaneous files. It retains every test, the existing deadlines
  and zero retries.
- The final `npm run test:release:admin` passed 196/196 in 32 files without
  filters or skips. Vitest took 460.64 seconds and the build plus gate took
  472.3 seconds. Both deadline cases and all rendering creation assertions
  passed together. The JSON report was checked independently.
- The selected adapter and architecture checks passed 11/11. The server
  TypeScript check, Svelte check, lint, formatting, relative link and Git
  whitespace checks passed.

The numbered creation bug is recorded in
[hooks/numbered-element-write-contention](../../../defects/hooks/numbered-element-write-contention.md).
The browser corrections reuse
[qa/admin-release-fixture-drift](../../../defects/qa/admin-release-fixture-drift.md).
One CMS bug and the existing QA defect were corrected. No vulnerability was
confirmed. One canonical defect card was added.
