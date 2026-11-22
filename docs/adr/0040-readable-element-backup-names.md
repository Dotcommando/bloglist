# ADR 0040: Name chunk and Snippet backups for human browsing

Date: 2026-10-29

Status: Accepted through the owner's explicit file-naming request.

## Decision

Write chunk and Snippet JSON copies as `elements/chunks/<name>.json` and
`elements/snippets/<name>.json`. Use their editable display names rather than
site-local ordinal keys. Keep readable Unicode and spaces. Percent-encode `%`
and characters forbidden in portable filenames, trailing dots/spaces and Windows
device names; bound the filename length. Distinct entities with colliding names
use readable suffixes such as `Name (2).json`, independently of their keys.
Reserve a new filename without replacing another entity's copy, including
concurrent saves. A complete save replaces its snapshot atomically and removes
that entity's previous named or numeric copies only after the replacement exists.

Read identity, version and content from JSON, independently of the filename.
Existing key-named copies remain readable; no database migration is introduced.
Template backup filenames retain their existing keys. Update the engine copy in
katerina-bloom and rename its current chunk/Snippet files without changing their
contents or database records.

This supersedes ADR 0021 only for chunk/Snippet backup paths. Runtime identities,
references, per-site/per-kind ordinal allocation and backup Pending/Ready guards
remain unchanged. Transferring content to another site does not require preserving
the source site's ordinal: new entity creation uses the target site's sequence.
This change does not introduce a cross-site importer or identity-restoration flow.

Copies remain private, site-scoped rendering sources. Reject foreign entities,
symlinks and paths escaping the owning source directory. Database entities retain
precedence over their copies; database failures do not select file fallback.
