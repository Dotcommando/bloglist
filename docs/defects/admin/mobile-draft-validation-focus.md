# admin/mobile-draft-validation-focus

Kind: confirmed bug. Status: fixed. Discovered: 2026-11-18.
Affected: baseline 8a5e693 (0.15.3); earlier range unknown. Fix target: 0.16.0.
Tags: mobile, More-menu, draft-save, native-validation, focus, hidden-tab, popover.

At narrow widths, clear the required page title, select SEO or TVs, then choose
More -> Save draft. The editor revealed Main but the open popover trapped focus,
leaving the invalid title unfocused. No save occurred; the correction path was
harder to use with a keyboard or assistive technology.

Correction: synchronously close More when revealing an invalid field and override
its close-focus restoration only for that validation target. Other dismissals
retain normal trigger focus. The user can correct the field and save normally.

Regression: [source/page browser suite](../../../test/integration/admin-rendering-ui.integration.spec.ts),
`focuses the invalid field after Save draft from the mobile More menu`.
Executed RED (focus false), then GREEN together with the complete
[TV editor scenario](../../../test/integration/template-variables-ui.integration.spec.ts).
Checks Main selection, focus, closed menu and absence of writes after rejection.

[Contract](../../arch/admin-frontend.md),
[evidence](../../changes/0.16.0/admin-site-journeys/50-verification.md).
