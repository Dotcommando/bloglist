# Media and recurring session contracts

> Historical implementation scope. This document records an early development
> boundary, including optional business capabilities. For current operation use
> the [developer guide](../guide/en/README.md) and maintained capability contracts.
> It does not authorize installing business code in the clean CMS distribution.

Historical integration contract: scheduling and booking implementation now belongs to the separate site installation. It is not installed in the clean CMS. See [ADR 0037](../adr/0037-clean-cms-and-site-installations.md).

The participation implementation is now owned by the separate installed add-on
under [ADR 0036](../adr/0036-site-addons.md). Its series commands also have
authenticated REST and administration UI. See [the current add-on contracts](site-addons-contracts.md)
for site enablement, disabled maintenance, event removal and transaction fences.

The media text below records the original fifth batch.
[ADR 0026](../adr/0026-site-files-and-named-media.md) extends the catalog;
[ADR 0027](../adr/0027-domain-owned-asset-directories.md) supersedes the physical
layout below with domain directories, `/assets/images` and `/assets/files`.
The [Files contracts](site-files.md) extend it with authenticated Files
administration, named public GET/HEAD, optional Original/Responsive upload mode
(omitted: Responsive), and inspected SVG/ICO geometry. Original mode preserves
usable source bytes without raster derivatives. Documents still have null image
geometry. The existing generic asset operations remain available locally.

The implemented fifth batch follows ADR 0010. Administrative operations resolve
through AppModule and capability-owned symbols. They use the explicitly trusted
local operator; no administration REST authentication is implied. Public HTTP
composition has no media mutation or scheduling authority.

## Media operations

- UploadAsset(siteId, actorId, filename, visibility, content) validates/counts
  actual bytes, detects content, stores a private original and Processing metadata,
  and returns assetId, immutable assetVersion and Processing state.
- GetAsset(siteId, actorId, assetId, assetVersion) returns owned internal metadata
  or null. It checks reference ownership. It must not be serialized as a public
  response: original references and diagnostics are administrative information.
- ProcessAsset(siteId, assetId, assetVersion, expectedVersion) is an awaited local
  operation. It claims the metadata version before output writes, then returns
  Ready or a sanitized error. Known failures become Failed. No queue, dispatch,
  automatic retry or Failed-to-Processing transition exists. Ready redelivery
  returns the existing version. After a crash, explicit inspection/re-upload is
  possible; there is no automatic recovery job in this batch.

Call UploadAsset, GetAsset to obtain its metadata version, then ProcessAsset in
sequence. The caller awaits processing and reports its error. A completed upload
receipt is not a Ready asset.

Images allow JPEG, PNG, WebP, AVIF, passive SVG and ICO, limited to 20 MiB.
Documents allow PDF, DOC, DOCX, UTF-8 CSV, XLS, XLSX and valid UTF-8 JSON, limited to 64 MiB.
Extension/content mismatch and unsupported or active SVG fail validation.
Raster decoding is limited to 40 million pixels; animation is rejected explicitly.
There is no antivirus. Inspection checks supported content, not every document's
semantic validity. Administrators remain responsible for the uploaded content.

Rasters normalize orientation and produce WebP with DEFAULT_IMAGE_QUALITY = 92.
Profile version 2 scales width as round(min(originalWidth, 1440) * viewport / 1440),
at least one pixel. All six profiles are mapped to actual output dimensions;
rounded duplicate widths share one derivative. Original bytes remain unchanged.
SVG, ICO and documents have a separate usable file reference, without invented
raster variants. Public visibility explicitly permits that public copy; private
originals never become public storage references.

ZARYA_MEDIA_ROOT is an explicit persistent filesystem object root. Logical keys
are scoped by siteId/assetId/assetVersion, with private/ and public/ trees. Files
are installed atomically without overwriting existing objects. Repeating a write
requires identical bytes. Traversal, foreign ownership and symlink components fail.
The neutral storage port can later be implemented by S3 without changing use cases.

ZARYA_MEDIA_PUBLIC_PATH defaults in .env.example to /media. A deployment's static
web server maps that path only to MEDIA_ROOT/public, with immutable caching and
appropriate MIME/disposition headers. Neither private/ nor the whole media root
is a web root. This batch does not add a public media HTTP controller; existing
published-document HTTP does not automatically serve the media directory.
Container media is persisted in a separate volume. Back up it together with
MongoDB metadata. Failed/uncertain writes may leave private or unreferenced
objects; no automatic garbage collection or deletion workflow is introduced.

## Session operations

CreateSessionSeries takes authorized siteId/actorId, owned pageId, positive
capacity and a pattern: startsOn, optional endsOn (null means unbounded),
everyWeeks, unique ISO weekdays (Monday 1 through Sunday 7), localTime HH:mm,
IANA timeZone and positive elapsed durationMinutes. It returns series metadata
and the generatedCount. Dates remain calendar dates. Any owned ordinary page,
including a draft, is eligible; no template name or Game entity is involved.

ChangeSessionSchedule takes siteId/actorId, seriesId, expectedVersion, scope,
sessionId (required for Occurrence/Following, null for Series), pattern and
capacity. It returns updated series metadata and the number of new sessions.
For Occurrence, startsOn is the explicit new local date. Following keeps earlier
rules and replaces recurrence beginning at the selected stable occurrence.
Series replaces future recurrence; started/past meetings remain unchanged.

Future old and new occurrences are paired in recurrence order, preserving their
sessionId values, requests, held/confirmed places and lifecycle state. Additional
occurrences get new IDs. Removed ones remain stored as Cancelled with occupancy
intact. Individual overrides survive subsequent series edits. Capacity below
occupied places fails before any write. Cancellation does not decline a request
or release its places. New reservations on cancelled sessions fail.

Rules have immutable ruleId values, and occurrences have stable within-rule
numbers independent of a generation window. Remapping rules during edits preserves
sessionId. Rule/number uniqueness prevents duplicate generation. Old removed
occurrences retain their original keys and cannot be revived by regeneration.

Each IANA zone preserves its local wall-clock time. Gaps shift forward by the
transition duration, overlaps choose the later instant; duration is elapsed time.
Explicit timeZone is currently required per series; this batch does not introduce
an independent site-time-zone settings operation.

SessionHorizonService is shared application orchestration invoked by a local
composition lifecycle on startup and every seven elapsed days. It materializes
up to the next calendar year, never historical missed meetings. It processes all
due series in bounded keyset batches, not just the first batch. Concurrent
extension/edit uses guarded transactions. A losing extension skips stale work;
other failures remain visible and the due state is preserved. In a server outage,
startup catches up. Individual overrides are found by logical occurrence keys
even when their actual dates have moved outside the current window.

MongoDB owns series/session metadata in explicit session_series and sessions
collections. Creation and schedule changes are atomic across both collections;
each modified session also compares its captured version so concurrent occupancy
changes are not lost. Requests are not rewritten by these operations.

## Verification

Fake-port application tests cover each operation. Adapter tests cover file
inspection/storage, actual WebP dimensions, temporal recurrence and persistence
translation. Isolated integration coverage runs through AppModule, real MongoDB
transactions, Sharp and filesystem objects, including races, rollback and isolation.
No deployment is performed by these checks. Administration users are the next
accepted capability under ADR 0011.
