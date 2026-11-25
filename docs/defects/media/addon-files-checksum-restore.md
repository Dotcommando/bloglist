# Add-on file restore required identical contents

- ID `media/addon-files-checksum-restore`.
- Confirmed bug, fixed in the 0.17.0 candidate.
- Discovered 2026-11-25. Affected candidate `84eec60`. Earlier range unknown.
- Read for add-on dumps, replacement, portable file references.

The candidate matched file paths and original checksums. Replacing a logo in place prevented
the archived reference from resolving even though its logical identity and public path
survived.

An existing file ID takes priority on the source site. Cross-site matches use a unique public
path. The review reports unmatched or ambiguous references.

The add-on dump regression restores an archive after changing the source logo bytes and
matches a second site's distinct logo bytes at the same public path.
[Executed regression](../../../test/integration/addon-dumps.integration.spec.ts).

[Candidate evidence](../../changes/0.17.0/files-library/50-verification.md).
