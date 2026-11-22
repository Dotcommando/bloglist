# ADR 0070: Retain verified immutable publication catalogs

Date: 2026-11-10

Status: Accepted through the owner's CMS 0.12.0 implementation request.

## Decision

FindPublishedPages selects the current active release on every operation and
reads its published page identities through IPublishedPageCatalogPort. The
catalog adapter performs the existing full publication-store verification before
admission, checks site/release ownership and Ready state, and excludes redirects.
The application operation validates its batch and activation; add-ons continue
using the same inbound operation without knowing storage or cache details.

Retain at most 128 catalogs and 32 MiB of conservatively accounted identity data.
Return detached arrays. Oversized results remain complete but are not retained.
Coalesce up to 128 pending identities; reject further distinct admission with an
explicit unavailable outcome. Do not cache missing or failed publications.
Diagnostics count hits, misses, evictions and admission refusals without content.

Catalogs are process-local and keyed by trusted site/release identity. Drafts do
not affect them. New page/site/routing releases have distinct identities. The
existing maintenance composition purges catalogs before and after replacement;
generation fencing prevents a pending old read from re-admitting restored state.
Offline changes still require stopping all serving processes. This supersedes
ADR 0069 only for repeated verification of the same immutable release.

The general publication store retains its current read semantics. This decision
does not cache authorization, add-on availability or active-release pointers.
