# ADR 0030: Searchable URL selection

Date: 2026-10-28

Status: Accepted through the owner's request on 2026-10-28.

Parent URL and redirect destination controls share a custom Bits UI popover with
a search field above at most ten matching URLs. Selection supports keyboard
navigation, explicit previous/next pages, loading, empty and retry states.
Changing the search resets the offset; obsolete responses cannot replace newer
results. The no-parent choice remains separate from the ten URL suggestions.

SearchUrls is an authenticated, site-scoped application query. Its dedicated
outbound search port performs literal case-insensitive substring matching on the
path, filtering before offset/limit, ordered by unique site path ascending using
MongoDB's simple binary ordering. Parent suggestions exclude self and the same
path-prefix descendants excluded by the previous control. Redirect suggestions
exclude self and all URLs whose current working kind is REDIRECT. Existing
redirect write contracts and their concurrency checks remain unchanged.

The suggestion endpoint does not read the complete routing catalog, publication,
page summaries or per-URL concurrency versions. The separate tree workspace
continues to use its complete catalog contract.

The existing unique (siteId, path) index supplies parent ordering. Migration 0023
adds (siteId, kind, path) for page-only destination ordering. Explicit index hints
make a missing migration fail instead of silently choosing an unindexed scan.
Substring matching can scan the site's ordered index entries; the index avoids a
blocking sort and full-document loading, but does not turn arbitrary substrings
into prefix-range lookups. Offset pagination also scans past skipped matches.
No full-text service or denormalized substring index is introduced for this scope.

Verify the selected query plans on isolated MongoDB with 1000 synthetic URLs:
IXSCAN, no COLLSCAN or blocking SORT, and database skip/limit. Test selection,
site isolation, redirect filtering, search reset and the existing URL workflows.
