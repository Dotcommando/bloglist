# Account row buttons use compact targets

- ID `admin/account-action-target-size`.
- Kind confirmed bug. Fixed in the 0.16.0 working tree.
- Recorded 2026-11-19 during the RBAC work. The shared rule is present at
  baseline `f63d9c5`. Earlier affected versions are unknown.
- Read for account rows, responsive layout and action target size.

The account editor showed 36 px password, block and delete targets with a fine
pointer in the 320 px viewport. The browser regression expects the account
editor's contracted 44 px targets. The shared compact desktop default did not
account for this workspace's stronger size requirement. Keep the common controls
and establish the required target size in the account editor. The action labels,
focus behavior and permission checks continue to use the existing controls.

The [browser regression](../../../test/integration/admin-users-ui.integration.spec.ts)
failed on the 36 px width assertion before the fix and passed in headless Edge
after the account workspace scoped the shared square controls to 44 px.
Verification belongs to the
[RBAC dossier](../../changes/0.16.0/rbac-abac/50-verification.md). The
[account table convention](../../../admin/src/AGENTS.md#tables-and-row-actions)
already specifies the required target size.
