# Add-on menu badge spacing

ID `addons/menu-badge-spacing`. Confirmed bug, fixed in the 0.16.0 branch.
Reproduced on 2026-11-20 on revision `03430dc`.

Open a site with an enabled add-on that returns a positive menu count. The site
menu buttons start 5 px below the top of the row. The shared top padding made
room for an absolutely positioned badge in a horizontally scrolling container.
Place the badge inside the button with its own space beside the label. The row
and its top edge stay aligned with the administration header.

No operator action is needed. The
[browser regression](../../../test/integration/addon-card-ui.integration.spec.ts)
`keeps the add-on badge inside the menu item without shifting the row` detected the
5 px gap at 390 and 1200 px before the fix. Both cases pass with the badge inside
the button after horizontal scrolling in Chromium.

See the [behavior and verification](../../changes/0.16.0/addon-menu-badge-spacing/10-behavior.md)
and [admin contract](../../arch/admin-frontend.md#add-on-workspace-layout).
