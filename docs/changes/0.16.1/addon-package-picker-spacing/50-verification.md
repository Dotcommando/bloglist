# Verification

RED: `groups the selected file with the chooser and separates the file actions`
in `test/integration/addon-card-ui.integration.spec.ts` measured equal gaps of
about 4.4 px on both sides of the filename at 1440 px.

GREEN: the Chromium regression passed at 1440 px and with a long filename
at 390 px. It verified an 8 px chooser gap, a clearly larger group gap, space
between Check package and Cancel, and the accessible description association.
The existing card upload and progress scenario passed on the same build.
Format, lint, admin typecheck and admin build were run. The final CSS and
test changes passed focused lint and the rebuilt browser scenarios.

One confirmed interface bug, zero confirmed vulnerabilities. See
[ambiguous file picker grouping](../../../defects/addons/package-picker-grouping.md).
