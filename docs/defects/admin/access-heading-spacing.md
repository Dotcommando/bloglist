# Access heading spacing

- ID `admin/access-heading-spacing`.
- Kind confirmed layout bug. Fixed in the 0.16.0 working tree.
- Recorded 2026-11-19. Read for workspace-heading spacing and nested tab bars.

Open Settings → Access on a site with access to the roles editor. The heading
was closer to the Settings submenu than to the Access tabs. The shared toolbar
and scroll pane already supplied vertical spacing. The nested Access container
added another 16 px before the tabs.

The Access toolbar puts more of its padding above the heading, and the nested
container relies on the scroll pane for its top spacing. The workspace keeps
its shared horizontal gutter and fixed heading. Opening Access after updating
the admin bundle shows the corrected layout. There is no account or data
recovery step.

The [Edge regression](../../../test/integration/admin-users-ui.integration.spec.ts)
extends “edits a site role and an independent access group in Settings” to
compare the two gaps at 390 px and 1440 px. It failed at both widths before the
fix and passed against the CMS and local preview builds. See the
[verification record](../../changes/0.16.0/rbac-abac/50-verification.md).
