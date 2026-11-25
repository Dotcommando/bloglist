# Unrelated uploads staled file card edits

- ID `media/file-card-catalog-revision`.
- Confirmed bug, fixed in the 0.17.0 candidate.
- Discovered 2026-11-25. Affected candidate `84eec60`. Earlier range unknown.
- Read for administration, importer, catalogue guard, edit revision.

A file card sent only the site-wide catalogue revision. A subsequent upload invalidated
replacement, rename and move of an untouched file.

The card submits a per-file token. The mutation transaction still uses the site fence and
compares the selected file revision before staging changes.

The Files HTTP regression replaces and moves an open file during batch import and rejects
reuse of the earlier revision for that same file.
[Executed regression](../../../test/integration/file-library.integration.spec.ts).

[Candidate evidence](../../changes/0.17.0/files-library/50-verification.md).
