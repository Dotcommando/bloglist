# Ambiguous file picker grouping

ID `addons/package-picker-grouping`. Confirmed layout bug found during the
local 0.16.1 cycle. The chooser, filename, check button and cancel button
occupied one row with equal gaps, making the filename's association unclear.

Group the filename with the chooser visually and through its accessible
description. Keep sufficient space between the two groups and allow long names
and the actions to wrap on narrow cards.
This enforces the existing
[form grouping conventions](../../../admin/src/AGENTS.md#form-layout-and-visual-grouping).

See the [browser regression](../../../test/integration/addon-card-ui.integration.spec.ts)
and [verification](../../changes/0.16.1/addon-package-picker-spacing/50-verification.md).
