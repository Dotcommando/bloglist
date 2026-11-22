# Cases

- F1: Publish another page while retaining a Request plan with a CMS favicon,
  stylesheet and frozen Build values. Preserve the icon/value and rebase CSS.
  Adapter unit: `test/adapters/page-release-build.spec.ts`.
- F2: Routing-only release retains the same favicon and rebases declared assets
  without changing page content. Adapter unit: routing-release-build.spec.ts.
- F3: A malformed favicon or private/foreign asset must still be rejected at the
  release builder. Targeted adapter cases plus existing favicon safety cases.
- I1: Real authenticated publication with a real stored favicon, a retained
  Request page and a new nested `.php` route. Verify new route/content, retained
  document/assets and active release through HTTP/MongoDB/filesystem adapters.
  `test/integration/admin-publication.integration.spec.ts`.
- U1: A failed publication after URL assignment refreshes assigned/public state,
  preserves input and makes no automatic publication retry. Browser regression
  to be selected in the existing administration fixtures.

No whole-suite run, production write, real content import or external delivery.
No new unit tests for declarations, template strings or arbitrary DI tokens.
