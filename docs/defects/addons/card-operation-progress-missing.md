# Missing progress on an add-on card

ID `addons/card-operation-progress-missing`. Confirmed in the local 0.16.1
development cycle and fixed on branch 0.16.1. A delayed repository request
disabled card controls without indicating that the selected card was waiting
for GitHub. File handling used the same busy flag and presentation.

Associate the operation with its add-on and show the shared spinner with its
label. Clear the indicator after success or failure and retain the existing
error and recovery controls.

See the [owner contract](../../arch/admin-frontend.md#add-on-workspace-layout),
the [browser regression](../../../test/integration/addon-card-ui.integration.spec.ts)
and the [verification evidence](../../changes/0.16.1/addon-loading-indicators/50-verification.md).
