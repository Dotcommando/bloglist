# Deployment browser fixture retained obsolete settings assumptions

- ID: `qa/deployment-ui-fixture-drift`.
- Kind: confirmed bug (QA). Status: fixed; both browser variants passed.
- Discovered: 2026-11-18 in existing deployment browser regression at baseline
  `d0cba85`; earlier affected range unknown. Fix target: 0.15.2.
- Read when changing: synthetic administration routes, settings tabs/headings,
  browser async failures, responsive deployment/header regressions.

The fixture omitted current favicon/resource/calibration read requests and threw
from an asynchronous route callback, producing unhandled rejections before its
intended responsive checks. It also expected no workspace heading and selected
the General installation tab when it meant the Main site-address form.

Correction: explicit synthetic read responses (including intentionally unavailable
resource control), current Main-tab selection, and one meaningful deployment h1
assertion. Unexpected routes remain failures; assertions are not deleted and no
production backend or contract is altered. Floating popover hit testing waits
for observable positioning instead of sampling its first unpositioned paint.

Executed RED: the existing regression failed with unexpected favicon/resources/
calibration requests and with one actual toolbar versus zero expected. Final
evidence is in the [fix dossier](../../changes/0.15.2/cms-build-info-dismissal/50-verification.md).
Regression: [deployment-ui.integration.spec.ts](../../../test/integration/deployment-ui.integration.spec.ts),
both `keeps recovery and the site header usable` variants. Browser tests intercept
all traffic and close browser contexts; there is no user/operator recovery flow.

Prevention: [fixture isolation and execution](../../cms-development/testing-policy.md#isolation-and-execution)
and the current [settings/header contract](../../arch/admin-frontend.md).
