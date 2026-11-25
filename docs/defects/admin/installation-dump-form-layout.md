# Installation dump actions stretched across one form

Confirmed bug in candidate `c80b77b`, reported 2026-11-25 and fixed for 0.17.0.
Earlier affected range is unknown.

The installation section placed both buttons in a single full-width column.
Its visible native file input used browser styling. Use two shared dump cards
with standard-width actions and the existing CMS file chooser. The desktop
grid stacks on narrow viewports.

The [archive browser regression](../../../test/integration/admin-users-http.integration.spec.ts)
checks geometry, the CMS chooser, selected filename and authenticated restore.
See the [candidate verification](../../changes/0.17.0/installation-dump-layout/50-verification.md).
