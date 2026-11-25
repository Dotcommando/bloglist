# Verification

The existing compiled administration failed the new Chrome assertion for two
installation cards. The layout check runs inside the isolated
[installation archive scenario](../../../../test/integration/admin-users-http.integration.spec.ts),
alongside real site and installation archive operations.

The fixed production bundle passed that scenario in Chrome at 1440 and 390 px,
with regular-width buttons, a usable native chooser triggered through the
CMS component, and successful restoration of the isolated installation.
The separate site dump checks passed for full site transfer, responsive
layout, request admission and the category transfer when run on its own.
TypeScript, Svelte diagnostics and affected source lint passed.

The category export times out after other cases in the same fixture on
both builds and passes on its own. The optional template-variable browser
scenario also fails at the same image-library locator on both builds.
