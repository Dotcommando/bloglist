# ADR 0051: CMS 0.8.0 schema baseline

Date: 2026-11-01

Status: Accepted through the owner's explicit consolidation and version request.

Amendment: [ADR 0052](0052-repository-addon-installation.md) adds global installation
metadata to this same baseline. The completed CMS 0.8.0 baseline has 36 collections
and 60 explicit indexes; the counts below describe the preceding consolidation.

## Decision

CMS Zarya and its administration workspace are version 0.8.0. The add-on contract
SDK retains its independent version 0.4.0.

Consolidate the current four core manifests into
`migrations/0000-schema-migrations.json` for fresh installations. Each of the
35 collections occurs once with its last declared validator. Preserve the final
58 explicit indexes, including key order, uniqueness, partial filters, collation
and TTL, and all collection dump roles. Exclude the retired global
`pages_mark_unique` index; retain `pages_site_mark_unique`. Fresh collections need
no index retirement or historical data transformations.

This extends ADR 0039 and supersedes the separate migration delivery described
in ADRs 0049 and 0050. Their business behavior remains unchanged. Future schema
changes use new versioned manifests.

This is not an upgrade procedure for databases with earlier receipts. Do not
modify existing data or migration receipts, reset databases, or accept an old
checksum as the new baseline. The migration runner continues to reject checksum
and unknown-migration mismatches. No site-project baseline is changed here.

Events records an exact CMS requirement of 0.8.0 in its package metadata and
README, independently of its SDK peer requirement. This metadata does not add a
repository downloader or a new runtime compatibility-checking mechanism.

## Verification

Before consolidation, freeze the final validators and accumulated indexes of
the existing chain as per-collection fingerprints, applying declared index
retirements. Compare the baseline against those fingerprints. Verify fresh
collection/index creation, strict validators, receipt checksum and idempotent
reapplication in an isolated random database. Keep index retirement recovery and
drift coverage through synthetic manifests independent of the deleted filenames.
