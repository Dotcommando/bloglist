# Media card truncation hides file extensions

Confirmed bug `admin/file-label-extension-hidden` in candidate `99ef34e`,
recorded on 2026-11-25 and fixed for 0.17.0.

On a populated media grid, CSS end truncation hid the extension of a long
filename. This made files with common prefixes hard to tell apart. The media
browser now fits the label with a fixed suffix and uses the agreed 13px and
14px sizes. The full filename remains available through each item's title
and accessible name.

The [Files browser regression](../../../test/integration/file-library.integration.spec.ts)
checks computed size, visible contents, measured fit and the complete
accessible name. See the [verification record](../../changes/0.17.0/file-name-fitting/50-verification.md)
and the [Files contract](../../arch/site-files.md).
