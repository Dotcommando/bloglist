# Verification

Verification used the 0.16.0 working tree from `51e186e`, an isolated
loopback MongoDB replica set and the configured headless Chromium browser.
The existing Synthetic fixture artifacts supplied the live-update packages.
The GitHub client used a controlled peer.

- Focused development runs checked Manager publication, Access revision
  conflicts, installation restore and re-login, bound views, badge refresh and
  write fencing, Action updates and the RBAC migration.
- The production build, repository format and lint, and the server/admin
  typechecks passed. Svelte reported zero errors and warnings.
- `npm test -- test/architecture.spec.ts test/clean-distribution.spec.ts`
  passed all five checks.
- `npm run test:release:admin -- admin-users-http addon-live-updates addon-action-updates rbac-migration`
  passed all 32 tests in four files with zero skips. Vitest took 429.44 seconds.
  The build and gate together took 442.5 seconds.
- Git whitespace and relative dossier link checks passed.

The coverage implementation confirmed zero new bugs and vulnerabilities and
created zero defect cards.

## Full release run

`npm run test:release:admin` ran without filters against the same working tree,
an isolated replica set and local Synthetic packages. The build passed. Vitest
ran 196 tests in 32 files in 485.01 seconds. There were 175 passes, 21 failures
and zero skips. All 32 tests in the four files added to the release selection
passed, including every requested scenario. All failures were in the earlier
release selection.

A separate diagnostic run repeated the 21 failed tests with two workers and
the same build. The manual page-order and nested-folder checks passed. Nineteen
failures reproduced:

- Sixteen browser cases in the hierarchy, document MIME and TV suites use
  fixtures that return an empty `/api/admin/auth/me` response. The current
  administration uses the returned authority to expose those controls.
- The whole-site journey waits for the former virtual-folder link label.
  The current label includes the folder path.
- The mobile page validation test locates the hidden Hook title input when
  looking for the page title.
- Concurrent numbered source creation still returns 409 `StaleWrite` where
  the test expects 201. This matches the
  [previous baseline evidence](../rbac-abac/50-verification.md#combined-verification-of-the-interface-follow-up).

The full and diagnostic reports are stored separately in the local release
results directory.
