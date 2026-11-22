# ADR 0025: Page tree, editable order and immutable numeric references

Date: 2026-10-27

Status: Accepted by the owner's page-tree request and explicit instruction to
preserve URLs when moving pages.

Pages gain a site-owned parentPageId, an editable sortOrder and a separate
immutable pageNumber. Existing opaque pageId values and MongoDB _id values remain
unchanged. pageNumber is a canonical decimal string, allocated sequentially from
1 per site, represented exactly with bigint/BSON long in its sequence. It is not
editable and is distinct from sortOrder. No ID is reused after archival.

Creation accepts an optional parentPageId (null means site root) and sortOrder.
Omitted sortOrder is max sibling order + 100, starting at 100 independently in
each parent. Explicit order is a nonnegative safe integer. Duplicate order values
are allowed: moves preserve the old order, and the administrator may adjust it.
The tree sorts siblings by order, then numeric identity, then opaque identity.
A page with children acts as a folder; folders start collapsed. The folder
control uses + when collapsed and - when expanded; leaves use the page icon.

MovePage takes siteId/pageId, destination parentPageId and the captured
expectedParentPageId/expectedSortOrder. It preserves pageNumber, sortOrder,
content, publication state, URLs and active releases. Missing/foreign targets
fail NotFound/Scope, stale positions Conflict, self/descendant moves Validation.
The application validates ownership and the parent graph; the persistence port
rechecks the graph and captured state inside a site-guarded transaction. Creation
uses the same guard for numeric allocation, sibling order and parent validation.
Local AppModule and authenticated REST expose the same operation. Network bodies
cannot assign numeric identity or trusted site/actor fields. Keyboard users can
also select a destination and move explicitly; drag-and-drop is an additional UI.

Pragmatic Drag and Drop's framework-independent element adapter owns pointer
dragging and drop targets in the Svelte tree. Dropping onto a page nests the
source; dropping onto the site-root target moves it to the root. It does not
renumber siblings or infer a new public path. Failed operations keep the previous
tree, source buffers and current selection.

Migration 0018 assigns numbers deterministically by site/createdAt/_id, initializes
the sequence, and backfills initial parents from the existing canonical PAGE URL
hierarchy where the parent is a same-site page. Existing per-parent order starts
at 100 with steps of 100. The migration is repeatable after interruption and
preserves opaque IDs, content, timestamps, URL history and active release artifacts.
Retained publications gain only the owning page's immutable numeric identity;
their published content and timestamps remain unchanged. Old frozen render plans
remain readable. New releases include the numeric identity in their page catalog.
Restoring content preserves current identity and tree position.

The supported MODX 2 link subset is [[~N]], usable in template/chunk markup and
Markdown link destinations: [Text]([[~12]]). Only link destinations in Markdown
are interpreted; arbitrary data and code blocks never become template programs.
[[*id]] exposes the numeric page number in templates. Links resolve against the
same site's selected published catalog, and their paths stay frozen in each
release. Missing/unpublished targets reject publication instead of producing a
broken or cross-site link. Draft saving permits incomplete references.

Full MODX URL schemes, property sets and executable content are outside this
request. Reference: https://docs.modx.com/2.x/en/building-sites/tag-syntax
