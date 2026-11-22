# ADR 0034: Create a page or redirect at a virtual URL folder

Date: 2026-10-28

Status: Accepted through the owner's request to turn virtual URL prefixes into
pages or redirects and adopt nested pages into the newly created Pages folder.

A virtual folder is a path prefix with working descendants and no saved URL of
its own. Its workspace offers Redirect settings and a link to Pages creation
with urlPath in the navigation query. The proposed folder URL survives reload
and section changes and is not replaced by title-based slugging.

MaterializeVirtualUrl accepts a trusted site/actor, path and either a page
identity or a page-URL destination plus 301/308 status. Normalize the folder path
to a trailing slash. Reject occupied paths (including the slashless equivalent),
nonvirtual/reserved paths, foreign entities, redirect destinations that are
redirects, and cyclic page graphs. SearchUrls permits an empty currentUrlId only
for redirect destinations at an address that has no saved identity yet. Database
limit/offset, ordering and tenant scoping remain unchanged.

Saving a page from this context creates its draft through CreatePage, then assigns
the folder URL and adopts existing page branch roots in one transaction. Draft
saving does not publish content or change the active release. Save & publish
then uses the existing publication workflow. If binding fails, the editor retains
the acknowledged page identity for retry; it must not create another page. An
acknowledged binding retry is idempotent for that same page/path. Existing children
whose page parent is another page inside the prefix keep that parent. Other
descendant branch roots move below the new page, preserving page identities,
numbers, order, content, URLs and existing published artifacts.

The explicit IVirtualUrlStore coordinates page positions and routing data. Its
adapter captures scoped business state and, under both existing routing and
site-content guards, rechecks that state, inserts the URL and moves branch roots
atomically. Stale captures and uniqueness/write conflicts fail without partial
adoption. Shared persistence mappers translate records; use cases receive no
Mongoose models or sessions. No schema or index migration is needed.

Creating a redirect does not reparent pages. After saving, reuse
PublishRoutingRelease and ADR 0031's pending-activation recovery without publishing
drafts. A redirect at the prefix does not replace exact child routes.

The authenticated POST `/api/admin/sites/:siteId/urls/virtual` accepts exactly
kind, path and either pageId or targetUrlId/redirectStatus. It returns the saved
URL, publication and publicationFailed, with 202 for pending activation.
Authorization, Origin/session/JSON boundaries and site ownership are unchanged.
