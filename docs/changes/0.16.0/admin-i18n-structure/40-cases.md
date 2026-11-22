# Verification cases

| Case | Evidence |
| --- | --- |
| Missing, invalid, persisted and blocked language storage | The existing admin i18n browser suite exercises the built bundle. |
| Live language switching | Login and editing browser tests check content-language independence. The users UI test checks that an existing validation message changes language and keeps the selected role and email. |
| Complete catalogs | A unit regression checks equal keys, nonempty messages and matching placeholder names for each registered locale. |
| Moved source imports and styles | Administration typecheck, lint, production bundle, affected unit tests and administration browser regression suites. |
