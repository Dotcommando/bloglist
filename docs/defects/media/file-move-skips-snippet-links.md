# media/file-move-skips-snippet-links

Kind: confirmed bug. Status: fixed. Discovered: 2026-11-20.
Affected: 0.16.0 development baseline before the file usages follow-up.
Earlier range unknown. Fix target: 0.16.0.
Tags: file-move, media-references, snippet-source, address-only-publication.

A literal library image address in a saved Snippet appears in file usages.
Confirming Update links changed the address in the file library and in page
drafts while leaving the Snippet source pointing at the former address. The
browser regression reached the actual move and detected the stale source.

Discovery examines Snippet code. The rewrite adapter enumerated only templates
and chunks. Enumerate the same editable source kinds and apply the existing
literal address rewrite to the Snippet code. Save repaired sources as drafts.
Only the existing address-only publication applies those address changes to
the active site. Compare the stored draft, the active HTML and the retained
release to catch unintended promotion of other draft changes.

The regression `explains and applies file address changes without publishing
unrelated drafts` passed against MongoDB and real Playwright. It verified the
rewritten Snippet draft and the previously published Snippet output on the
active page. The move added one release and preserved the retained release.

If the move reports a later reference update failure, reload Files and check
the listed sources. The move can commit before addressing all usages.

[File contract](../../arch/site-files.md),
[browser regression](../../../test/integration/admin-users-http.integration.spec.ts),
[verification dossier](../../changes/0.16.0/rbac-abac/50-verification.md#interface-recommendation-14-file-move-effects).
