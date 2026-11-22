# ADR 0079: File address edits and missing media

Date: 2026-11-11

Status: Accepted through the owner's CMS 0.13.0 file-management request.

## Decision

Replacement retains the logical file identity, library name and output URLs,
independently of the local upload filename. The Cloudflare gateway forwards
X-Zarya-File-Metadata along with the streamed body, content length and current
administrative session. Metadata is input, never authority; the existing origin,
authentication, authorization, size and format checks remain at the origin.

File rows can be dragged into a folder or their own category root. This changes
their folder, including every generated variant. Cross-category moves remain
invalid. The existing folder selector remains available for keyboard and touch.

Clicking the file heading opens an input with matching font metrics and text
origin. Its border extends around the existing text. Blur or Enter submits the
new name; Escape cancels. The normal name/path validation and catalog version
guard apply. A successful rename displays a localized success snackbar naming
both the old and new filename.

Before a rename or move, the administration reads current usages under the
captured catalog version. When usages exist, a modal offers Cancel, Update
addresses, or Keep old addresses with an explicit broken-link warning. Update
addresses changes exact literal current and historical output references in editable
templates, chunks, parameter defaults, TV defaults and page TV values. Page body,
Open Graph and rendering/loader parameters are updated by a page-owned guarded
operation. Historical paths reclaimed by another file are preserved. Variant
addresses retain their profile suffix while adopting the new filename stem. Stable typed media
identities continue to resolve the moved file. Foreign absolute URLs and longer
filenames sharing a prefix are preserved. Site-owned absolute and URL-encoded
references are supported.

The media operation delegates source changes through an explicit outbound port
to the existing source/TV inbound operations. Those operations own permissions,
version guards, validation and private source backups. No direct cross-capability
collection writes or local-operator authority enter the HTTP composition.

The named-file move commits before sequential source saves. This is not an
atomic transaction across filesystem projection, source backups and page data.
A source conflict/failure rejects the operation; the UI acknowledges no success
and tells the administrator to refresh Files and inspect the sources. Earlier
acknowledged source saves and the file move can remain committed.

[ADR 0081](0081-immediate-published-media-address-updates.md) supersedes the
original publication limitation: choosing Update addresses immediately activates
an address-only copy of the current publication and invalidates its document
cache. Other draft changes are not published. Historical publications remain
immutable. Site-wide configuration and dynamically assembled URLs are not
rewritten; no media redirects are introduced.

Usage discovery includes page TV values, TV defaults and typed Image/File
identities, including retained page versions. TV definitions have a neutral
TemplateVariable usage target projected to the TV editor by inbound adapters.

Missing literal library URLs remain visible and editable in template/chunk
source fields and text/Markdown TVs. A message below the field identifies the
absent address. Missing typed media and failed previews have an explicit warning
and retain their value. Opening an editor never executes source or requires
successful image loading.

## Verification

Focused tests cover the streamed upload and replacement paths through the
gateway and real authenticated composition, same/different upload filenames,
guarded source/TV saves and rejection paths, reference scope, modal choices,
dragging, heading geometry, blur/cancel, and editors containing missing media.
Fixtures and databases are isolated; no production mutation is part of verification.
