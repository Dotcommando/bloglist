# ADR 0027: Domain-owned asset directories and document roots

Date: 2026-10-27

Status: Accepted through the owner's domain-directory and Files discussion.

The configured data root contains one directory per registered primary domain.
Public image outputs live in `<domain>/images/`, documents in `<domain>/files/`.
Private immutable originals and prepared content remain in `<domain>/.private/`.
Public URLs are `/assets/images/<path>` and `/assets/files/<path>`; the trusted
request hostname selects the site. No site identity is added to those paths.
The public controller handles only these two prefixes, leaving generated
`/assets/styles/`, scripts and other publication assets to their own delivery.

Stable site and asset identities remain independent of directory names. A small
private `.storage-index/` records the last installed domain; ownership markers
prevent overwriting a directory belonging to another site. The filesystem adapter
checks traversal and symbolic links. All asset writes and catalog projection
swaps use the same per-site writer lock as domain relocation.

UpdateSite saves the registered domain, then synchronizes the asset directory.
This is not a distributed transaction: a relocation failure is returned rather
than acknowledging completion. Repeating UpdateSite or accessing storage finishes
the recorded relocation without changing immutable object identities. A crash
after directory rename but before index replacement is recoverable. An active
writer blocks relocation; unrelated sites remain independent. Shared filesystem
writers across multiple hosts remain unsupported.

Images and documents have independent folder namespaces in one site-owned catalog.
The left drawer always shows `assets/images` above `assets/files`. Files cannot
move between the roots or be replaced with a different root's content. Documents
retain actual MIME and byte size, have null image geometry and no image variants.
PDF, DOC/DOCX, XLS/XLSX, CSV and valid UTF-8 JSON are supported up to 64 MiB;
images retain the 20 MiB limit and existing processing choices. File-type icons
use detected MIME, keeping DOC/DOCX and XLS/XLSX paired.

Migration 0021 extends catalog validation for folder roots and nullable document
geometry. Existing folders without a root remain image folders. Explicit offline
binary migration preserves the former logical object references and rebuilds the
named projection. Old public URLs are not redirected or rewritten in authored
content. This supersedes ADR 0026's physical layout and public URL prefix.
