# Narrow file rows clip the fitted label

Confirmed bug `admin/file-list-label-clipped` in candidate `41f73fc`,
reported on 2026-11-25 and fixed for 0.17.0.

The list used a flex row around an intrinsically sized label grid. On narrow
viewports the text could extend beyond the row's inner content even when its
text value included the complete extension. Use separate icon and constrained
label columns. Prevent the measured label from resizing the table column and
fit to its precise rendered width. Keep a minimum width for the name action
and allow horizontal scrolling if the metadata columns do not fit.

The [browser regression](../../../test/integration/file-library.integration.spec.ts)
measures the rendered text against the visible label and row boundaries at
phone and tablet widths and verifies the protected suffix. See the
[verification record](../../changes/0.17.0/file-list-label-width/50-verification.md).
The earlier [end truncation defect](file-label-extension-hidden.md) affected
which text was selected for display.
