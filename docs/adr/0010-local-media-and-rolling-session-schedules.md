# ADR 0010: Local media and rolling session schedules

Date: 2026-10-25

Status: Accepted through the owner's instructions in the implementation discussion.
Supersedes conflicting storage, responsive-width and processing policies in ADR 0002
and resolves the scheduling policies left open by ADR 0009.

## Media

Use an explicitly configured filesystem object-storage adapter, scoped by siteId,
behind the existing technology-neutral storage port. A future S3 adapter can
implement the same port. No S3 server, antivirus, queue or automatic processing
retries are required. Originals are immutable and private. Public derivatives and
explicitly public attachments live in a separate public root with stable URLs.
Only administrators upload. Validate actual content, not declared MIME or size.

Images accept JPEG, PNG, WebP, AVIF, SVG and ICO, at most 20 MiB. Documents accept
PDF, DOC, DOCX, CSV, XLSX and XLS, at most 64 MiB. Retain original bytes. SVG and
ICO retain their source format for public use; documents have no image variants.
Reject active/external SVG content. Raster processing is resource bounded.

Raster derivatives use WebP and DEFAULT_IMAGE_QUALITY = 92. Normalize orientation.
For viewport profile P, derivative width is round(min(originalWidth, 1440) * P / 1440),
at least one pixel; height preserves aspect ratio. Profiles remain
320/576/768/992/1200/1440. Store actual output dimensions and profile mappings.
This is not a declaration that an image fills its viewport. Original 1000x400
therefore yields 1000x400 at 1440 and 833x333 at 1200.

UploadAsset stores a validated original and Processing metadata. ProcessAsset is
an explicit awaited operation: one attempt, returning Ready or an error, with
Failed metadata when failure is certain. No background dispatch or retries.
A repeated Ready invocation returns the immutable result. Incomplete output is
never Ready. Storage writes are immutable, acknowledged and checksum checked;
uncertain metadata outcomes are reread before failure disposition.

## Scheduling

Series reference an owned ordinary pageId. Requests reference stable sessionId,
never a separate Game identity. Local trusted operator composition remains the
administrative entry point for this batch.

Weekly recurrence supports every N weeks and selected ISO weekdays. It may have
an end date or remain unbounded. Materialize only the next calendar year in the
series IANA zone. A weekly server task extends the horizon; startup catches up
after downtime without generating missed historical meetings. Persist a generation
watermark, stable occurrence identity and exceptions. Concurrent extension/edit
uses guarded atomic commits; extensions do not duplicate or revive occurrences.

Keep local time in its explicit IANA zone and concrete start/end instants in UTC.
For repeated local times select the later instant after the transition; for gaps
shift forward by the transition duration. Duration means elapsed minutes.

ChangeSessionSchedule has explicit scopes: one occurrence, this and following,
or the entire series. Preserve started/past sessions. A same-count recurrence
change pairs future occurrences in order, preserving sessionId. Extra occurrences
receive new IDs; removed ones become Cancelled. Preserve existing individual
exceptions. Bookings, occupancy and request decisions remain intact on moves and
cancellations so the administrator can contact participants and decide manually.
Capacity cannot be reduced below occupied places. Independent series may overlap.

## Subsequent administration capability

The owner explicitly requests an administration-user entity. Its next five
operations are UpdateAdminUser, BlockAdminUser, DeleteAdminUser, GetAdminUser and
ListAdminUsers. Creation is available only through an interactive .sh script,
which asks for the new administrator's email and reads the password once without
echoing it. No public/admin HTTP creation operation is exposed. Authentication,
credential storage, deletion and blocking contracts will be specified with that
capability; this decision does not add user-management implementation to this batch.
