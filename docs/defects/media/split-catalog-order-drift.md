# Split catalog order drift

ID `media/split-catalog-order-drift`. Confirmed bug. Fixed in the 0.17.0
candidate on 2026-11-24.

The first normalized adapter read full snapshots in MongoDB's incidental
index order. An unchanged list could differ from the last upload response,
and the integration check after domain relocation reproduced the difference.
Full reads now sort by the stable logical creation time with a unique
tie-breaker. Replacement retains the logical creation time.

[Files integration regression](../../../test/integration/file-library.integration.spec.ts),
scenario “serves documents and relocates images, documents and originals
when the primary domain changes”. [Files contract](../../arch/site-files.md).
