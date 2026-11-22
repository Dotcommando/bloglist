# Media defect index

Read matching mechanisms only; use the linked record and regression on demand.

| Record | Guarantee and triggers | Regression |
| --- | --- | --- |
| [media/file-move-skips-snippet-links](file-move-skips-snippet-links.md) | Update links must follow discovered editable source kinds and preserve address-only publication. Tags are file-move, snippets and publication. | [Live delegated browser case](../../../test/integration/admin-users-http.integration.spec.ts) |
| [media/inspection-io-error-masking](inspection-io-error-masking.md) | Media inspection blamed file content for a system read failure; tags: inspection, temporary-file, system-I/O, error-classification | [Owning regression](../../../test/adapters/media-inspection-errors.spec.ts) |
| [media/stale-reconciler-overwrites-current-output](stale-reconciler-overwrites-current-output.md) | Delayed reconciliation replaced a newer acknowledged projection; tags: pending-journal, version-fence, named-output, concurrent-reconciliation | [Owning checks](../../../test/adapters/file-library-projection.spec.ts) |
| [media/projection-lock-leaked-before-staging](projection-lock-leaked-before-staging.md) | Failed staging creation stranded a media writer lock; tags: stage-creation, ENOSPC, resource-lifetime, writer-lock, cleanup | [Owning checks](../../../test/adapters/file-library-projection.spec.ts) |
