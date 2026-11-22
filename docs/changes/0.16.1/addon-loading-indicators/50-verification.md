# Verification

RED: held the repository response in Chromium using the saved administration
bundle. The card's controls disabled, but its spinner never appeared.
The selected scenario was `shows progress on the add-on card until repository
and file operations settle` in `test/integration/addon-card-ui.integration.spec.ts`.

GREEN: Chromium at 390 px held requests for catalog refresh, a repository
failure, file upload and verification, update status, apply and enable. Each
indicator appeared on its owning surface and cleared after the response, and
the card remained usable. The current-version and source link scenario passed.
The real repository installation integration scenario delayed both the initial
package installation and source linking, and observed their separate spinners.
Its desktop card layout and mobile overflow assertions also passed.
The settings scenario held the connection metadata request and verified that
the settings spinner appeared and cleared.

`npm run format`, `npm run lint`, admin typecheck and admin build passed.
The admin typecheck reported zero warnings. Vite retained its informational
chunk-size warning.

One confirmed interface bug, zero confirmed vulnerabilities. See
[missing card progress](../../../defects/addons/card-operation-progress-missing.md).
