# ADR 0028: URL workspace and site address settings

Date: 2026-10-27

Status: Accepted by the owner for this implementation.

## Decision

Add site-scoped URLs and Settings sections to the existing Svelte administration
application. Expose routing through the authenticated REST composition, retaining
local AppModule operations and the existing routing transactions, access checks,
history and one-current-PAGE-URL constraint. Public composition receives no local
operator authority.

The new GetUrlCatalog input is siteId. Its result contains complete owned
versioned working URLs, minimal page summaries and the selected active release's
routes and actual sitemap paths. Missing sites fail NotFound, foreign data fail
Scope, and a disappearing URL during catalog capture fails Conflict. The catalog
is an administrative view; it is not a transactional snapshot across capabilities.
Mutations retain their existing atomic captured-state checks.

The drawer groups exact stored paths and synthesizes missing path prefixes as
virtual folders. It preserves distinct `/section` and `/section/` addresses.
This display does not rewrite stored routing parents or the independent page
tree. Virtual folders are neither saved routes nor redirect destinations.

Cards show working and active behavior separately, linked page information,
public and local page links, actual sitemap membership, nested paths, incoming
redirects and history. A page editor links directly to its current URL card.
The public/local page links open new tabs. Missing configuration is shown
explicitly rather than inferred from the administration request host.

ChangePageUrl adds optional expectedUrlId; the authenticated editor supplies the
address it observed. A different current address fails Conflict before commit.
The existing whole-subtree transaction remains authoritative. Parent-only is
selected by default; the alternative previews stored routing descendants.
The old address redirects to the new address atomically. A separate versioned
RedirectUrl command can then retarget that retained address to another existing
URL, including a section page or the root. This does not claim atomicity across
these two distinct commands. Cycles and foreign targets remain rejected.

URL changes remain working data until a separate full-site publication activates
a release. The URLs workspace exposes that existing publication command and
explains its scope: all saved routing changes and already published page versions.
It does not publish unsaved editor buffers or silently publish draft content.

## Site addresses

Site gains optional addresses with nullable publicOrigin and localOrigin. Values
are canonical HTTP(S) origins without credentials, path, query or fragment. Legacy
sites remain explicitly unconfigured. The settings form separates the local
origin and port; storage uses the complete origin including its nondefault port.

Settings GET reads the owned Site; POST invokes UpdateSite with addresses and
expectedAddresses. A stale captured settings value fails StaleWrite. The existing
site transaction compares the complete captured Site before saving, preserving
unrelated fields and concurrent changes. Migration 0022 permits this optional
object without inventing addresses for existing sites.

These values configure links and sitemap output. They do not register hostname
aliases, change trusted host resolution, alter shared backend listeners or parse
environment variables per request. The owner explicitly limited the local port
to links and local viewing. Local origins never enter publication snapshots or
public artifacts.

## Sitemap publication

A configured publicOrigin is captured at publication. The frontend build writes
public `sitemap.xml` from actual published page routes whose frozen page snapshot
allows indexing. Redirects and virtual folders are omitted. The origin is explicit;
no scheme or domain fallback is invented. Without it the release has no sitemap.

An incremental page release replaces that page's sitemap paths and retains the
membership of unchanged routes from the selected previous sitemap. Current draft
metadata cannot change the membership of unchanged published pages. Historical
releases without sitemaps require full-site publication to populate the complete
site sitemap; incremental publication must not guess historical indexability.

The sitemap is an immutable checksummed artifact belonging to the same release
as the routes. Public GET/HEAD selects the active release, with ETag support and
revalidation. Old releases and unactivated staged output are not substituted.
The admin reads this artifact for membership rather than predicting it from drafts.
Reserve `/sitemap.xml` during builds. Reject output above 50,000 URLs or 50 MiB
instead of truncating it; sitemap indexes remain a separate future capability.
