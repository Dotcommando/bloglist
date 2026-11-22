# Existing guarantees

[Inline actions/build information](../../../arch/admin-frontend.md),
[release artifacts](../../../arch/release-artifacts.md), `scripts/AGENTS.md`,
`.github/workflows/release.yml` and gateway workflow own this scope.
The release workflow explicitly runs typecheck, lint/build, 21 gateway assertions,
workspace/artifact/metadata tests, seven real Docker service-user/import failure
regressions, clean packaging/inventory verification and GitHub Release publication.
No full suite or unrelated database scenario is selected by the tag workflow.
Existing [dismissal record](../../../defects/admin/build-info-not-dismissed.md)
is relevant: retain its keyboard/viewport guarantees. Its fix changed summary to
a button and omitted the existing shared text-action style. Runtime/backend defect
indexes do not apply to this presentation change.
Site update preserves exact applied migration bytes and selected Events runtime;
no database upgrade/content restore/publication is implied. Six owner cookie-
notice files were already modified before the CMS update and must stay separate.
