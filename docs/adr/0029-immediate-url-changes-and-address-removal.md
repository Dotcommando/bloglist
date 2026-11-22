# ADR 0029: Immediate URL changes and permanent working-address removal

Date: 2026-10-27

Status: Accepted by the owner on 2026-10-27.

## Immediate application

Changing a page URL in administration applies immediately while preserving its
published content. This supersedes ADR 0028's separate publication requirement
for address moves. Do not publish draft edits or rebuild templates, assets or
Build Snippets as a side effect.

Keep ChangePageUrl as the local working-state command. ChangePublishedPageUrl
authorizes the actor before changing working routing and invokes the new
PublishRoutingRelease operation. The latter selects one activated release,
captures owned working routing, stages immutable output and activates with
compare-and-swap. A lost activation acknowledgement uses the existing receipt;
the address mutation is never replayed automatically.

Reuse previously published page IDs and their compiled HTML or frozen Request
plans. Move static document artifacts to their new paths and omit removed
documents from the new public root. Retain prebuilt assets and frozen Build
values. Requalify injected Request-plan asset links for the new release without
rebuilding asset bytes. Update Request-plan page catalogs' routing identities, parent references
and paths while retaining their original published membership/content metadata.
Sitemap membership follows the selected release's indexability decisions with
updated paths. Routing never publishes content for an unpublished page.

Routing and artifact publication are separate commits. If routing saved but
publication fails, return the acknowledged URL, publicationFailed=true and HTTP
202. The UI explicitly reports pending public activation and offers Apply URL
changes, which publishes routing without repeating a move. HTTP 200 with an
activated release acknowledges public application. Without an active release,
the URL remains working data until content is published.

## Address disposition

When only parentUrlId changes, preserve the current URL identity, mark, path and
page binding. Save the relationship through the captured graph transaction and
activate routing with the same frozen content. Address-disposition options apply
only when the path changes; no redirect or replacement address is created for a
parent-only edit. Reject cycles, foreign parents and stale captures as usual.

oldUrlAction defaults to Redirect. Delete removes the old working URL and its
working history; after activation its path returns 404. Keep the page and its
published content. Do not rewrite historical immutable releases or serve them
as route fallback. Page-version restoration never resurrects deleted URLs.

Show the nested-page choice only when descendant PAGE paths exist in the URL tree,
including addresses without an optional parentUrlId reference.
Keep is the default and preserves their paths. PromoteWithRedirect and
PromoteWithoutRedirect show the affected page count and a preview. They remove
the old parent's segment throughout the subtree: `/section/old/item/detail/`
becomes `/section/item/detail/`, independently of the new parent address. The
first keeps old child addresses as redirects; the second removes them/history.
The older moveSubtree operation remains available to existing local callers;
the administration uses the new three-choice model.

When deleting a parent would leave dangling relationships, preserve retained
URL identities and paths while rebinding parent references to replacement or
nearest surviving parents. This is an explicit exception to parent-reference
immutability in this reviewed operation. Ordinary saves retain their restrictions.

For addresses selected for deletion, show existing incoming redirects (including
transitive chains) and their destinations. Retarget is the default and sends
them to the appropriate replacement URL. Delete removes those redirect URLs
and histories. Show this choice only when affected redirects exist.

## Transaction boundary

The domain constructs the final site-owned graph. The persistence port carries
complete captured/resulting graphs for advanced changes. Under the existing
per-site transaction guard, compare the whole capture, purge explicitly removed
records/history, update related records and insert new identities atomically.
Validate final graph integrity and uniqueness. Concurrent membership changes,
occupied promoted paths, foreign references or faults roll back the working
change. HTTP never accepts caller-selected graphs or trusted actor identities.
