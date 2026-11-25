# Media browser refresh shifts its results

- ID `admin/media-browser-refresh-shift`, kind bug, discovered 2026-11-25.
- Affected 0.17.0 candidate `838be12`. Fixed and verified in 0.17.0.
- Triggers include refreshing a populated Files folder or updating the shared
  media picker. Tags include refresh, loading overlay and scroll position.

The in-flow loading paragraph added a row to the media browser and pushed the
existing results and pager down while the request was active. The results now
stay mounted under the shared spinner and translucent overlay. The visible area
sets the spinner center. On failure, the previous results remain and Refresh
retries the request.

The [Files Chrome regression](../../../test/integration/file-library.integration.spec.ts)
holds a refresh of an existing list, checks its geometry and loading state,
scrolls the pane, then returns a failure and retries. See the [execution evidence](../../changes/0.17.0/media-browser-refresh/50-verification.md),
[Files contract](../../arch/site-files.md) and
[CMS loading standard](../../cms-development/feature-design.md#loading-over-existing-data).
