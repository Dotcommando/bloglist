# Verification cases

| Case | Boundary and expected result |
| --- | --- |
| Manager publication | Playwright saves and publishes a page, applies pending routes and verifies public output. Whole-site publication is unavailable. |
| Access revision | Two browser sessions edit one policy. The stale save receives 409 and refresh shows the winning policy. |
| Add-on views | Playwright checks independently granted nested screens, direct links and the restricted view's data. |
| Repository update | Playwright checks preparation, installation across two sites and recovery after a dropped acknowledgement. Connections and records are preserved. |
| Add-on badge | Playwright checks changes after mutation, late responses during site selection and disabled or hidden items. |
| Installation restore | Playwright uploads a damaged and then a valid archive, confirms restore and signs in again. The isolated installation's data and files match the captured state. |
| Update admission | Real HTTP checks preparation, repository check, status and apply with restricted roles. |
| Runtime write fence | Real HTTP exercises a pending write across processes while the site connection changes. |
| Runtime Actions | A Compatible update with removed Actions is refused. An interrupted Exclusive update preserves the selected package and catalog; a retry through the coordinator preserves unchanged grants, requires explicit grants for new Actions and retires removed Actions. |
| Badge admission | Real HTTP distinguishes screen and count grants and validates per-site private responses. |

The [account/role fixture](../../../../test/integration/admin-users-http.integration.spec.ts)
owns the Manager, Access, restore, view, badge and connection checks. The
[live update fixture](../../../../test/integration/addon-live-updates.integration.spec.ts)
owns the repository recovery and admission checks. The
[Action update fixture](../../../../test/integration/addon-action-updates.integration.spec.ts)
builds checksummed declaring packages and exercises the production coordinator.
The [migration regression](../../../../test/integration/rbac-migration.integration.spec.ts)
also joins the [release gate](../../../../vitest.config.admin-release.ts).

Run the release gate with `ZARYA_TEST_MONGO_URI` pointing to an isolated replica
set, `ZARYA_TEST_BROWSER_EXECUTABLE` pointing to a Chromium-family browser and
`ZARYA_TEST_SYNTHETIC_PACKAGES` pointing to the separate Synthetic project's
fixture artifacts. The live update suite uses the existing fixtures 0.2.0,
0.2.1, 0.3.0, 0.3.1 and 0.3.2. The repository test supplies a controlled GitHub
peer and a test-generated PEM.
