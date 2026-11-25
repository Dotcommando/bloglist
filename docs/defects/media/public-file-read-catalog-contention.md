# Public file reads depended on unrelated catalog changes

- ID: `media/public-file-read-catalog-contention`.
- Kind: confirmed bug. Status: fixed in the 0.17.0 candidate.
- Discovered: 2026-11-25. Affected candidate: `df6e10e`. Earlier range unknown.
- Read for: named public delivery, GET/HEAD, replacement, pending journal, ETag.

Public output lookup reread the global catalogue header and could reject a
read when another file changed. Pending replacement also hid the previous
content before the new projection was installed. The same public path could
be unavailable until reconciliation.

The active indexed path now selects an immutable object. A staged row becomes
active after projection, and a response pins its chosen object. The existing
reconciliation command resumes a failed install. Affected replacements keep
serving the previous entry until promotion.

The [Files integration suite](../../../test/integration/file-library.integration.spec.ts)
pauses a real replacement while issuing GET and HEAD for the same URL. It
also combines public reads with real bulk projection. The owning behavior is
documented in [Site Files](../../arch/site-files.md).
