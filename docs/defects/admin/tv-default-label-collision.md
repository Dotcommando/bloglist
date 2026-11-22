# admin/tv-default-label-collision

Kind: confirmed bug. Status: fixed. Discovered: 2026-11-18.
Affected: baseline 084c36b; earlier range unknown. Fix target: 0.16.0.
Tags: TV, default, image-picker, File, duplicate-id, accessible-name.

In the TV definition editor the Default value heading and the image/file value
control both used `tv-default-label`. Image selection's aria-labelledby resolved
to the heading first, so its accessible name was Default value instead of the
field caption. The File caption label also collided with the heading ID.

Correction: give the section heading its own `tv-default-heading` identity and
keep the existing control label identities. All four kinds retain their value
semantics. No new confirmation or operator recovery is required; the picker is
again discoverable by its field caption after loading the corrected UI.

Observed RED: `npm run test:integration --
test/integration/template-variables-ui.integration.spec.ts`, scenario
`edits TV definitions and template assignments through the built administration
UI`, expected one button named Game image and received zero. The real TV journey
also timed out finding Default photo; trace confirms both duplicate IDs and the
rendered picker. This is a built DOM/accessibility regression, not a backend bug.

GREEN: the complete existing TV UI fixture and both real TV journeys passed in
the final 140-case/19-file gate. No remaining verification for this bounded fix.

[Focused regression](../../../test/integration/template-variables-ui.integration.spec.ts),
[real TV journey](../../../test/integration/admin-tv-journey.integration.spec.ts),
[TV contract](../../arch/template-variables.md),
[verification](../../changes/0.16.0/admin-site-journeys/50-verification.md).
