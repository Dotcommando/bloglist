# Crowded refresh arrowheads

ID `admin/refresh-glyph-legibility`. Confirmed and fixed in the 0.16.1 admin.
The arcs joined the arrowheads almost tangent to one arm, blurring that join
at the actual button size. The smaller path bounds and narrow stroke reduced
readability.

Use the licensed Lucide Refresh CW glyph with its diagonal joins and 2-unit
stroke in the existing shared button. Distribute its ISC notice with the
administration build. See the
[shared action conventions](../../../admin/src/AGENTS.md#reuse-administration-controls),
[browser regression](../../../test/integration/addon-card-ui.integration.spec.ts)
and [verification](../../changes/0.16.1/refresh-icon-legibility/50-verification.md).
