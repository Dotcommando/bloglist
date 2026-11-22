# Build information could not be dismissed outside its trigger

- ID: `admin/build-info-not-dismissed`.
- Kind: confirmed bug. Status: fixed; browser regression passed.
- Discovered: 2026-11-18; reproduced at `d0cba85` (CMS 0.15.2 development branch).
  Earlier affected range unknown. Fix target: 0.15.2.
- Read when changing: build provenance, header overlays, popover dismissal,
  keyboard/focus, pointer interactions, responsive administration.

Clicking the CMS version opened a native details disclosure used as an overlay.
Escape and clicks outside did not close it; it obscured the workspace until its
trigger was clicked again. Native details supplies disclosure toggling, not the
overlay dismissal/focus lifecycle this interaction requires.

Correction: reuse the existing Bits UI Popover, retaining metadata/local-build
content and bounded viewport placement. Its trigger, portal and content own
outside/Escape dismissal, focus restoration and listener cleanup. Clicks inside
retain readable/selectable metadata; the user can reopen without navigation or
mutation. No new recovery prompt or operator action is needed.

Regression: [real admin bundle](../../../test/integration/cms-build-info.integration.spec.ts),
`dismisses and reopens details without losing header interaction` at 1440/320px.
Executed RED independently reproduced Escape and outside-click failures. GREEN
and the responsive metadata/header regression are tracked in the
[verification evidence](../../changes/0.15.2/cms-build-info-dismissal/50-verification.md).
Backend/database tests are inapplicable: only the browser interaction changed.

Owning guarantee: [build information interaction](../../arch/admin-frontend.md#build-information).
