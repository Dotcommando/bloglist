# ADR 0095 — Normalize Files metadata and journal named outputs

Date 2026-11-24

Status accepted for the 0.17.0 candidate.

## Context

One BSON record contained a site's entire Files catalog. Each media change
rewrote the record and rebuilt both named storage trees. The BSON ceiling
limited catalog size, and failed projection blocked unrelated delivery.

## Decision

Keep site-level catalog metadata separately from file, folder and operation
records. Index the site-scoped identities, folder contents and public names.
Migration 0019 moves the existing data in one transaction per site.

Commit metadata and the durable journal together. Prepare each affected
file before applying its named output changes. Acknowledge the journal
after projection and private object cleanup. During recovery, fence the
operation under the existing site writer lock. Migrated legacy journals use
the existing full rebuild because they contain no delta.

Use bounded folder queries and direct file and public path lookups.
Incremental SDK addition and folder creation honor the existing site version
fence internally. Legacy snapshot consumers remain available during the
transition. See the [Files contract](../arch/site-files.md) and the
[candidate evidence](../changes/0.17.0/files-library/50-verification.md).
