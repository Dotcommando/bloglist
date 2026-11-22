# Existing behavior

- PublishCurrentPage assigns an initial URL and publishes the page version before
  PublishPageRelease renders/builds/stages/activates a release. Preserve truthful
  partial outcomes; these stages are not a single transaction.
- PageReleaseBuildAdapter and RoutingReleaseBuildAdapter rebase retained Request
  CSS/JS and validate their public manifest membership. Do not skip that guard.
- `favicon-head.ts:isSiteFaviconLink` already recognizes the exact CMS-generated
  root favicon link, including marker, MIME, attribute count and SHA-256 version.
  The favicon is site-owned and does not belong to a release's assets directory.
- PageEditor retains its initial publication options/availability on failure;
  this causes the false no-URL warning after successful initial assignment.
- [Publication contract](../../../arch/rendering-and-publication.md),
  [admin contract](../../../arch/admin-frontend.md),
  [URL contract](../../../arch/url-workspace.md).
- Relevant publication/pages defect indexes were consulted. No existing record
  covered favicon classification or partial-publication URL reconciliation.
  Header/popover records are unrelated.
