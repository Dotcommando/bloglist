# Verification

RED: Chromium rendered the old glyph in an 18 px icon box. Its paths occupied
16 units of the 24-unit view box horizontally and used a 1.7-unit stroke.
The new geometry assertion failed in `shows a centered refresh glyph with a
clear stroke at the shared button size`.

GREEN: Both targeted Chromium tests passed, covering the glyph geometry,
stroke and accessibility state, and the add-on refresh and progress flow.
Formatting, lint, admin typecheck and admin build passed. The built admin
contains `THIRD_PARTY_NOTICES.txt`.

One confirmed visual defect, zero confirmed vulnerabilities. See
[refresh glyph clarity](../../../defects/admin/refresh-glyph-legibility.md).
