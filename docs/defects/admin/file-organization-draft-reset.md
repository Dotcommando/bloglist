# admin/file-organization-draft-reset

Kind: confirmed bug. Status: fixed. Discovered: 2026-11-18.
Affected: baseline 8a5e693 (0.15.3); earlier range unknown. Fix target: 0.16.0.
Tags: Files, rename, move, independent-save, pending-input, reference-confirmation.

Selecting a different Folder and then saving only File name reset the pending
folder selection to the saved folder. The independent Save name action silently
discarded input belonging to Save folder. The same refresh could reset an unsaved
name while saving the folder.

Correction: capture both input buffers before the operation; after acknowledged
success update the saved field and preserve the other buffer. Keep actual saved
folder identity separate from the pending Folder input. Existing reference-update
confirmation and optimistic media versions remain authoritative. Users can save
each field in either order without re-entering the unrelated value.

Regression: [real Files UI](../../../test/integration/file-library.integration.spec.ts),
`shows the built Files UI, both upload modes, copied HTML and Force delete without a dialog`.
The case now seeds its own site, image, Photos folder and used reference.
Executed RED: expected the pending folder identity after rename, got empty string.
The corrected standalone case passed both preservation assertions, actual deletion
by file ID, reference confirmation and subsequent mobile upload. Final release
selection is tracked in the linked evidence.

[Files contract](../../arch/site-files.md),
[evidence](../../changes/0.16.0/admin-site-journeys/50-verification.md).
