# ADR 0080: A replaceable site favicon

Accepted for 0.13.0 on 2026-11-11.

The Main settings form accepts an ICO file through the shared MediaFileInput
component, backed by a native ICO-only file input, without resolution choices. An
authorized editor uploads a replacement immediately, independently of page
publication. Metadata reports byte size and the largest ICO frame dimensions.
The administration displays KiB with at most one fractional digit and pixel
dimensions. The file input shares a row with the public origin from 768px.

GetSiteFavicon and UploadSiteFavicon use a site-scoped storage port. Inspection
validates actual ICO contents using the existing image upload boundary and its
20 MiB limit. Invalid input or a failed pre-commit storage write retains the previous icon. The
filesystem adapter stages outside the site's tree and atomically replaces the
single `.private/favicon.ico` file in the domain-owned media directory. No media
library entry, metadata sidecar, version history or database migration is needed.

Public GET/HEAD of `/favicon.ico` resolves the registered site before reading any
file. It returns the current icon with a content-derived ETag and mandatory
revalidation. Each read owns an immutable temporary snapshot, disposed on every
exit including HEAD, 304 and failed transfers. The Cloudflare gateway proxies
this path before static assets so replacement does not require a deployment.
The path is reserved from page publication. Full site dumps include and restore
the private icon with the existing media-tree capture; selective Files exports
continue to describe the visible media library.

## Explicit HTML references and removal

The owner's follow-up on 2026-11-11 requires an explicit favicon link in page
source and a working clear button. DeleteSiteFavicon authorizes the editor,
removes the private icon under the same site writer lock, then applies the
publication change. Repeated deletion is idempotent. The shared field's clear
button invokes POST /api/admin/sites/:siteId/favicon/delete with an empty JSON
object; the body limit is 1024 bytes. Authentication precedes body consumption.

Publication capture includes the current favicon metadata. Full/incremental
builds inject one managed link into static HTML or the saved Request plan's head:
`<link rel="icon" type="image/x-icon" href="/favicon.ico?v=<version>" data-zarya-favicon>`.
The version is the validated content digest, so replacement changes the address.

Upload/replacement and removal also extend the address-only publication workflow
from ADR 0081: the optional favicon value preserves the current link when absent,
replaces/adds it when metadata is provided, and removes it when null. A new
immutable release preserves published content and frozen Build values without
compiling or publishing unrelated drafts. Activation remains guarded and receipt
reconciled. Document cache invalidation cancels pending/running refreshes before
success returns. Existing historical publications stay immutable.

Only the managed link is removed; independently authored icon links remain owned
by their templates. Request-plan validation recognizes exactly the generated
root favicon link with its digest. Foreign or malformed links cannot bypass the
normal compiled-asset boundary. There is no per-request head rewriting or file
inspection added to public document delivery.

Storage and release activation are separate commits. A later failure rejects
without acknowledging success, and the icon can already have changed. Reread
metadata and retry through the operation. Deletion affects subsequent public
reads; already opened snapshots can complete and are always disposed.
