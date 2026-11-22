# Existing behavior

Owning component: `admin/src/app/CmsBuildInfo.svelte`, used by AdminWorkspace.
Native details lacks overlay dismissal. ReferencePicker/PageEditor already use
Bits UI Popover. Preserve the compact header and popup viewport containment.
[Admin contract](../../../arch/admin-frontend.md),
[release provenance](../../../arch/release-artifacts.md).
Defect router has no matching admin interaction record; runtime/backend/QA
records do not describe this mechanism and need not enter context.
Existing deployment-ui integration covers header layout at 320–1440px.
