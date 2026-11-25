# Media defect index

Read matching mechanisms only; use the linked record and regression on demand.

| Record | Guarantee and triggers | Regression |
| --- | --- | --- |
| [media/addon-files-checksum-restore](addon-files-checksum-restore.md) | Restore follows logical Files even after content replacement. | [Add-on dumps](../../../test/integration/addon-dumps.integration.spec.ts) |
| [media/addon-export-dangling-file](addon-export-dangling-file.md) | Forced deletion leaves portable business data exportable. | [Add-on dumps](../../../test/integration/addon-dumps.integration.spec.ts) |
| [media/file-move-reference-retry](file-move-reference-retry.md) | Content/publication repair survives failure after a move. | [Files integration](../../../test/integration/file-library.integration.spec.ts) |
| [media/file-card-catalog-revision](file-card-catalog-revision.md) | An unrelated upload does not stale the open file card. | [Files integration](../../../test/integration/file-library.integration.spec.ts) |
| [media/picker-mime-after-save](picker-mime-after-save.md) | Restricted pickers reject mismatched inspected content before storage. | [Files integration](../../../test/integration/file-library.integration.spec.ts) |
| [media/public-file-read-catalog-contention](public-file-read-catalog-contention.md) | Active public reads and ETags are independent of unrelated catalogue writes. Tags are GET, HEAD and replacement. | [Files integration](../../../test/integration/file-library.integration.spec.ts) |
| [media/abandoned-site-writer-marker](abandoned-site-writer-marker.md) | Writer admission reclaims the unique marker of a dead process. Tags are lock recovery and local concurrency. | [Writer process regression](../../../test/integration/media-writer-process.integration.spec.ts) |
| [media/split-catalog-order-drift](split-catalog-order-drift.md) | Read and upload snapshots use stable logical creation order. Tags are MongoDB ordering and domain relocation. | [Files integration](../../../test/integration/file-library.integration.spec.ts) |
| [media/batch-storage-writer-contention](batch-storage-writer-contention.md) | Concurrent valid uploads wait for the site storage writer within a bound. Tags are batch, storage lock and admission. | [CMS API integration](../../../test/integration/cms-api.integration.spec.ts) |
| [media/file-move-skips-snippet-links](file-move-skips-snippet-links.md) | Update links must follow discovered editable source kinds and preserve address-only publication. Tags are file-move, snippets and publication. | [Live delegated browser case](../../../test/integration/admin-users-http.integration.spec.ts) |
| [media/inspection-io-error-masking](inspection-io-error-masking.md) | Media inspection blamed file content for a system read failure; tags: inspection, temporary-file, system-I/O, error-classification | [Owning regression](../../../test/adapters/media-inspection-errors.spec.ts) |
| [media/stale-reconciler-overwrites-current-output](stale-reconciler-overwrites-current-output.md) | Delayed reconciliation replaced a newer acknowledged projection; tags: pending-journal, version-fence, named-output, concurrent-reconciliation | [Owning checks](../../../test/adapters/file-library-projection.spec.ts) |
| [media/projection-lock-leaked-before-staging](projection-lock-leaked-before-staging.md) | Failed staging creation stranded a media writer lock; tags: stage-creation, ENOSPC, resource-lifetime, writer-lock, cleanup | [Owning checks](../../../test/adapters/file-library-projection.spec.ts) |
