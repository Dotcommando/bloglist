# Verification

RED: the selected `installs from the built Add-ons page, stays disabled for both
sites and survives restart` browser scenario in
`test/integration/repository-addon-installation.integration.spec.ts` measured
57 px between the heading and first action at 1440 px on the previous bundle.

GREEN: the same scenario passed with the action group and items aligned to
the start. Measured offsets were below 1 px at 1440 and 390 px. The responsive
overflow and repository linking checks in the scenario also passed.
`npm run format`, `npm run lint`, `npm run build --workspace @zarya/admin`
and `git diff --check` passed. Vite reported the existing chunk-size warning.

One confirmed layout bug and zero confirmed vulnerabilities in scope. See the
[defect record](../../../defects/addons/card-action-vertical-alignment.md).
