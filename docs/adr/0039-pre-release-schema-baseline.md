# ADR 0039: Consolidate the pre-release schema baseline

Date: 2026-10-29

Status: Accepted through the owner's explicit consolidation request.

Amendment: [ADR 0051](0051-cms-080-schema-baseline.md) consolidates the subsequent
core manifests again for CMS 0.8.0; the original counts below describe the earlier baseline.

## Decision

Before the first release, replace the historical core manifests with one
`migrations/0000-schema-migrations.json`. It creates each collection once, using
its last declared validator and the union of all indexes created by the former
chain. Preserve index key order, uniqueness, partial filters, collation and TTL.
The CMS baseline contains 21 collections and 32 explicit indexes, plus MongoDB's
implicit `_id` indexes. Historical data defaults and PageTreeV1 are unnecessary
for empty collections and are not part of this fresh-install baseline.

Apply the same consolidation separately in katerina-bloom. Its baseline also
preserves the four collections and ten indexes from its three historical
scheduling/participation manifests: 25 collections and 42 explicit indexes.
These installation-owned collections do not become part of the clean CMS.
Installed add-on package migrations and their separate receipts are unchanged.

This explicitly supersedes ADR 0037's requirement to retain the old core manifest
identities/checksums and its preservation of the three site manifests as separate
files. The distribution/site ownership boundary remains in effect.

This is a fresh-install baseline, not an automatic upgrade of an existing
database. Do not rewrite or delete old receipts, reset data, or reinterpret an
old checksum as the new baseline. Existing databases fail the unchanged checksum
and unknown-migration checks until a separately authorized transition is made.
After this consolidation, further schema changes use new versioned manifests;
the normal rule against editing applied migrations remains in force.

## Verification

Freeze per-collection fingerprints of the former final validators and accumulated
index definitions in test fixtures. Verify the single manifest against these
fingerprints. On isolated random databases, verify exact collection/index sets,
strict validators, receipt checksum and idempotent reapplication. Retain focused
page metadata and synthetic legacy tree transformation coverage independently of
the removed migration filenames.
