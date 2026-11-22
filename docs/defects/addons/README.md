# Add-on defect index

Read matching mechanisms only, following the [lookup route](../README.md).

| Record | Guarantee and triggers | Regression |
| --- | --- | --- |
| [addons/prerequisite-failure-misdiagnosed](prerequisite-failure-misdiagnosed.md) | Availability faults need their real private cause and evidence-based remedy; tags: verifyMigrations, storage, cause, false-advice | [Availability regression](../../../test/adapters/registered-addon-availability.spec.ts) |
| [addons/invalid-created-runtime-not-disposed](invalid-created-runtime-not-disposed.md) | runtime-install, createRuntime, invalid-hook-extension, invalid-handler, close, resource-lifetime | [Owning regression](../../../test/adapters/addon-package-registry-install.spec.ts) |
| [addons/installation-primary-failure-masked](installation-primary-failure-masked.md) | InstallAddonFromRepository, activation-failure, discard, AggregateError, immutable-claim | [Owning regression](../../../test/app/addons/install-addon-from-repository.spec.ts) |
| [addons/failed-staging-cleanup-lost-ownership](failed-staging-cleanup-lost-ownership.md) | GitHub-package-delivery, private-staging, discard, cleanup-ownership, next-preparation | [Owning regression](../../../test/adapters/github-addon-delivery.spec.ts) |
| [addons/menu-badge-spacing](menu-badge-spacing.md) | Site menu stays flush with the header when a count is present; tags: menu-badge, horizontal scrolling, layout | [Browser regression](../../../test/integration/addon-card-ui.integration.spec.ts) |
| [addons/completed-update-shown-as-candidate](completed-update-shown-as-candidate.md) | A restored completed operation must not appear on the active update form; tags: reload, local storage, stale update | [Browser regression](../../../test/integration/addon-live-updates.integration.spec.ts) |
| [addons/card-action-vertical-alignment](card-action-vertical-alignment.md) | Card actions start at the top; tags: card, flex, desktop, wrapping | [Browser regression](../../../test/integration/repository-addon-installation.integration.spec.ts) |
| [addons/card-operation-progress-missing](card-operation-progress-missing.md) | Show which add-on operation is pending before controls unlock; tags: spinner, card, repository, upload, retry | [Browser regression](../../../test/integration/addon-card-ui.integration.spec.ts) |
| [addons/package-picker-grouping](package-picker-grouping.md) | File status belongs with the chooser; tags: upload, filename, spacing, wrapping | [Browser regression](../../../test/integration/addon-card-ui.integration.spec.ts) |
