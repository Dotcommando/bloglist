# URLs and site address settings

See [ADR 0028](../adr/0028-url-workspace-and-site-addresses.md).
Address moves now follow [ADR 0029](../adr/0029-immediate-url-changes-and-address-removal.md),
which supersedes their original separate-publication flow.
Redirect saves now apply immediately under [ADR 0031](../adr/0031-immediate-redirect-application.md).

The URLs menu opens `/admin/sites/:siteId/urls`. Actual URL cards have
`/urls/:urlId` deep links; the page editor uses `/urls/-/page/:pageId` to select
the current address. Settings opens `/admin/sites/:siteId/settings`.
Both sections use the shared responsive drawer/workspace layout and language
catalog. Switching sections retains unsaved page content. Site navigation and
browser close retain the workspace's unsaved-change protections.

The tree is a projection of paths, not Page.parentPageId or Url.parentUrlId.
Selecting a synthetic prefix shows its missing page/route status and direct
child paths. A real route at that prefix additionally exposes its page or
redirect details. The sitemap filter retains ancestor folders for context.

Virtual prefixes can be materialized as a page or redirect under
[ADR 0034](../adr/0034-materializing-virtual-url-folders.md). The page-creation
link requires `cms.urls.list`, `cms.pages.create` and `cms.urls.materialize`.
It displays the selected folder address (for example, “Create a page at /blog/”)
and supplies it in Public URL path. Saving assigns that address and
atomically adopts nested page branch roots into the new Pages folder, retaining
their paths, content and order. Draft saving leaves the new page unpublished.
Redirect creation reuses the same destination picker and immediate routing-only
publication as saved redirect settings; exact child routes remain available.

## Authenticated HTTP contracts

All endpoints are scoped to `/api/admin/sites/:siteId`, require the established
session/Host/Origin boundary and return `no-store`. Only the dedicated suggestions
endpoint accepts its declared query parameters; other routing endpoints reject queries.
The session provides the actor; caller-selected actor/site ownership fields
are rejected. Each route requires its action on the selected site.

| Method and suffix | Input / result |
| --- | --- |
| GET `/urls` | GetUrlCatalog: complete versioned working URLs, page summaries and active published routing/sitemap membership |
| GET `/urls/suggestions` | SearchUrls: currentUrlId, purpose=Parent or Redirect, optional q (default empty), limit (default/max 10), offset (default 0); siteId and items with siteId/urlId/path/kind |
| GET `/urls/:urlId/history` | Existing ordered history, wrapped in items |
| POST `/urls/:urlId/move` | pageId, path, parentUrlId, moveSubtree, redirectStatus, optional oldUrlAction/childrenAction/incomingRedirectAction; URL, publication and publicationFailed |
| POST `/urls/publish` | Empty body; apply saved routing using frozen public content |
| POST `/urls/:urlId/redirect` | expectedVersion, targetUrlId, redirectStatus; acknowledged URL, publication and publicationFailed |
| GET `/settings` | siteId and addresses with nullable publicOrigin/localOrigin |
| POST `/settings` | addresses and expectedAddresses; acknowledged site address settings |

Move supplies expectedUrlId from the route, allocates a fresh opaque URL mark,
and translates the final path segment. Existing application and repository
checks validate ownership, occupied paths, captured state, parents and subtree
membership. The interface previews the same path-prefix subtree used by the
transaction. Redirect is the default old-address action; Delete purges that
working URL/history. Nested pages can keep paths or move up one level with/without
redirects. Affected incoming redirects are listed and can be retargeted or removed.
Changing a retained redirect's destination is an independent save after a move
and immediately activates routing using frozen published content.
Changing only the routing parent saves the existing URL without replacing its
identity/path or creating a redirect. The action is enabled when either the path
or parent changes. Address-disposition controls are disabled for a parent-only edit.

Without `cms.urls.list`, the workspace explains how to get the URL catalog.
With the catalog and without `cms.urls.suggest`, the card shows the stored
routing parent and redirect destination for reading. A path change keeps the
parent, and an existing redirect can change its status while keeping its
destination. Selecting a new parent or destination uses the suggestion action.
The URL catalog supplies its linked page summary. Opening the draft requires
read access to that page. The card shows how to request access if the action
is absent or its scope excludes the page.

Address moves immediately activate a routing-only release preserving frozen public
content. A saved move whose publication fails returns 202 with publicationFailed
and a recovery action. Apply URL changes never publishes draft content or repeats
the saved move. Redirect saves use the same immediate activation and 202 recovery
contract; Apply URL changes retries publication without repeating the redirect save
or adding history. With no active release, the UI confirms a working save and
explains that content publication is required before routing is public.
After a 202, the card directs writers without `cms.urls.publish` to an authorized
site administrator. The publication action can apply the saved routing even
when the publisher has no catalog access.

Invalid inputs return 400, absent/foreign routing references 404, routing and stale
settings conflicts 409, missing authentication 401 and denied authority 403.
Unexpected failures remain sanitized 500 responses. An uncertain mutation is
never replayed automatically; refresh before retrying.

Both URL selectors use server suggestions rather than filtering the tree catalog.
Search matches a literal substring of the URL path without case sensitivity.
Results follow ascending path order (simple binary collation), with at most ten
URLs per request. Previous/next controls pass offset to MongoDB; changing the
search resets it. While suggestions load, keep the previous items visible and
disabled under a circular loading overlay; replace them only when the response
arrives, preserving the dropdown height during pagination.
Parent selection retains a separate no-parent option and excludes
self/descendant paths before pagination. Redirect selection returns only PAGE
URLs, excluding self and existing redirects before pagination. A retained legacy
redirect target can still be displayed without being offered as a new choice.
Missing/foreign current URLs return 404, invalid or duplicate query fields return
400, missing sessions return 401. The schema baseline includes the suggestion index.
See [ADR 0030](../adr/0030-searchable-url-selection.md) for query/index guarantees
and substring/offset scan characteristics.

## Publication and settings

Settings are site-owned data in the sites collection, validated by the schema
baseline. Unconfigured sites have no implicit addresses.
Origins configure links; trusted hostname mappings and server listening ports
remain separate. Public links can point to addresses not yet published; the
card explicitly shows the active release behavior alongside working behavior.

Save settings before publishing to generate sitemap.xml. Address moves update
the active sitemap through their immediate routing release. Content publication
and initial sitemap generation retain their separate publication actions.
In Settings, reading the saved values, saving changes and rebuilding use
separate grants. Rebuild uses the saved settings. An editor who saves a new
public origin without publication access sees who can refresh the sitemap.
Local origin/port changes affect only admin links. The public HTTP
boundary serves GET/HEAD `/sitemap.xml` from one active, activated release and
rejects query parameters. The artifact is also part of static exports.

Cards show actual inclusion in the active sitemap. Draft robotsIndex is displayed
separately and does not predict current membership. A historical release without
the artifact is explicitly identified. Publish the whole site once after enabling
sitemaps for historical publications to populate every eligible page.

When the file is absent, the workspace distinguishes an unconfigured public
address from an active release that predates sitemap generation. The first case
links to Settings; both explain the required full-site publication. Existing
published pages alone do not supply an absolute public origin or alter a retained
release's immutable artifacts.
