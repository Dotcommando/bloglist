# Transliteration table alignment and density

- ID `admin/transliteration-table-alignment`.
- Kind confirmed bug. Fixed in the 0.16.0 working tree.
- Recorded 2026-11-19 in the local Settings → Transliteration preview.
- Read for responsive columns, toolbar alignment and hints below rule inputs.

The shared form-field margin lowered the language selector's action buttons
relative to the selector. The hint occupied space in the input cell, leaving
15 px more space below the input than above it. At 1440 px the table rendered
three columns wider than 440 px.

The toolbar resets the field margin and centers the buttons on the selector.
Rows center the input and reserve equal space above and below it. The hint sits
below the input outside normal flow. The container width determines when to add
columns, with each column capped at 264 px.

The [Edge regression](../../../test/integration/admin-users-ui.integration.spec.ts)
checks alignment, compact rows, stable geometry when hints appear and one to
four columns. See the [verification results](../../changes/0.16.0/rbac-abac/50-verification.md).
The [form layout conventions](../../../admin/src/AGENTS.md#form-layout-and-visual-grouping)
already govern the use of compact multi-column settings.
