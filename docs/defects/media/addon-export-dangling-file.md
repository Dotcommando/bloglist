# A missing file blocked add-on export

- ID `media/addon-export-dangling-file`.
- Confirmed bug, fixed in the 0.17.0 candidate.
- Discovered 2026-11-25. Affected candidate `84eec60`. Earlier range unknown.
- Read for add-on dumps, force delete, optional references.

A single force-deleted file caused a backup to reject all selected add-on business data. The
export could not represent a missing file entry.

The archive keeps every business row and tracks missing IDs. Same-site restore can keep them.
Cross-site restore needs a resolved path or explicit omission allowed by the add-on schema.

The add-on dump regression force-deletes one of two referenced files, checks the export report
and verifies both supported restore outcomes.
[Executed regression](../../../test/integration/addon-dumps.integration.spec.ts).

[Candidate evidence](../../changes/0.17.0/files-library/50-verification.md).
