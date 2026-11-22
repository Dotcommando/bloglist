# Add-on card actions vertically centered

ID `addons/card-action-vertical-alignment`. Confirmed layout bug found and
addressed during the local 0.16.1 development cycle.

Open Add-ons at desktop width. Details and actions share a flex row. The
stretched action container centers the buttons relative to the full details
height. Added description lines or status text push the controls down.

Align both the action group and its items to the top. Preserve wrapping on a
narrow card. The
[browser regression](../../../test/integration/repository-addon-installation.integration.spec.ts)
measures the first action at 1440 and 390 px. See
[verification](../../changes/0.16.1/addon-card-action-alignment/50-verification.md).
