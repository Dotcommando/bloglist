# Site Files

Independent File name and Folder saves preserve the other field's pending input,
including after the reference-update confirmation. Saved metadata and draft input
remain distinct; saving a rename does not silently discard a pending folder move.

Files follows [ADR 0026](../adr/0026-site-files-and-named-media.md) and
[ADR 0027](../adr/0027-domain-owned-asset-directories.md). The site-scoped
left drawer contains folders and images; selecting an image opens its details.
The two roots are `assets/images` and `assets/files`. Each has its own folder
namespace. Documents use detected MIME icons (PDF, Word, Excel, CSV and JSON);
all image formats share an image icon. Folders are catalog data, independent
of private immutable object-storage keys.
Moving a file uses drag-and-drop onto a folder/category root or the
destination-folder selector; variants move with the image.
The name input and folder selector each have their own adjacent save button.
Each button is disabled until its field changes, then uses the primary style.
Saving one field preserves the other field's persisted value and leaves any
unsaved edit to that other field in the form.

Click the file heading to rename it in place. Blur/Enter applies the name;
Escape cancels. The text origin and font metrics stay fixed while the input
border appears around the heading. A success snackbar names the old and new file.
See [ADR 0079](../adr/0079-file-address-edits-and-missing-media.md).

See [streamed file I/O](streamed-file-io.md) for the required file policy,
raw upload headers, early authentication and metadata-only HEAD/304 reads.

Content-validation codes describe invalid uploaded data. A local staged-file
system-operation failure keeps the technical failure route after releasing its
temporary input; it is not reported as an invalid image/document to the author.

## Operations

Administrative operations require an active authenticated account with the
corresponding grant on an existing site. Site and path identifiers never confer
permissions. HTTP composition binds request-owned session access and no trusted
local-operator provider. AppModule also exposes the operations through
FILE_LIBRARY_OPERATIONS for the existing explicit local operator.

| Operation | HTTP |
| --- | --- |
| ListMediaFiles | GET /api/admin/sites/:siteId/files |
| BrowseMediaFolder | GET /api/admin/sites/:siteId/files?root=images |
| GetMediaFile | GET /api/admin/sites/:siteId/files?fileId=… |
| CreateMediaFolder | POST /api/admin/sites/:siteId/files/folders |
| UploadMediaFile | POST /api/admin/sites/:siteId/files |
| ChangeMediaImage | POST /api/admin/sites/:siteId/files/:fileId/change |
| MoveMediaFile (including rename) | POST /api/admin/sites/:siteId/files/:fileId/move |
| GetMediaUsages | GET /api/admin/sites/:siteId/files/:fileId/usages?expectedVersion=... |
| DeleteMediaFile | POST /api/admin/sites/:siteId/files/:fileId/delete |
| ReadMediaContent | GET /api/admin/sites/:siteId/files/:fileId/content?key=... |
| ReconcileMediaLibrary | POST /api/admin/sites/:siteId/files/reconcile |

Commands use the complete current library version. Folder creation takes name and
nullable parentId and root (`images` or `files`; children inherit their parent
when omitted). Upload sends a binary stream with bounded metadata containing
filename, nullable folderId and mode. Original and Responsive are explicit
per-file choices. Change image sends filename metadata and a binary stream but
retains the library name, folder, mode and existing public
output names. Move takes name and nullable folderId. Names must be portable,
nonblank, at most 180 UTF-16 code units, and unique ignoring case/NFC normalization
within the public path namespace; generated variant names also reserve paths.
Extension changes during rename are allowed; content MIME remains detected from
actual image bytes. Public HTTP uses the detected MIME, not the displayed suffix.
Names allow letters, digits, spaces, dots, parentheses, hyphens and underscores,
starting with a letter/digit. Copied names such as `report (2).xlsx` are supported.
Leading/trailing spaces, trailing/consecutive dots and Windows reserved names
remain invalid. See [ADR 0032](../adr/0032-upload-filenames-and-validation-errors.md).

In the Files workspace, upload and folder creation require the current version
from the file list even at a root. A writer without `cms.files.list` sees the
missing permission in the workspace and next to the granted action in Access.
The workspace requires file usages access alongside move or delete. A user
without this access sees file metadata and the relevant permission guidance.
Force delete in the workspace follows an explicit review of the current version.
File listing supplies metadata and file-type icons. Reading a private preview,
downloading the original or opening a variant requires `cms.files.read-content`.
The details explain which permission enables these actions.

The existing UploadAsset/GetAsset/ProcessAsset pipeline retains original bytes,
validates actual formats and limits, and awaits one processing attempt. Original
adds no raster variants. Responsive uses profile version 2 and WebP quality 92.
PDF, DOC/DOCX, XLS/XLSX, UTF-8 CSV and valid UTF-8 JSON use an unchanged usable
copy, null geometry and no raster variants. Documents are limited to 64 MiB.
WOFF2 fonts are detected from their bytes, use font/woff2, the 64 MiB file limit,
null output geometry and one unchanged usable copy under assets/files. They are
available in the Files picker and static deployment export; they do not produce
raster variants. Disguised non-font content is rejected.
SVG/ICO have dimensions and one usable source-format copy. All preparations finish
before the image enters the library. Failed or losing uploads may leave private,
unreferenced immutable objects; they never receive a named public path.

Read responses expose dimensions, detected MIME, byte size, mode, hasVariants and
named public output URLs. They omit storage references and diagnostics. The
authorized content endpoint accepts original or an output key; it is also used
for previews/downloads when the administration origin differs from the site.

Internal usage/reference contracts carry a typed Page/Template/Chunk/Snippet/Site
identity instead of an administrative URL. Inbound REST and CMS developer-API
adapters project it to the existing editorPath; persistence and rendering do not
construct admin navigation.

GetMediaUsages returns title, field, editorPath, state and one of Content,
OpenGraph or Templates. Sources include drafts, all three retained page versions,
current template/chunk HTML/CSS/parameters/scripts, site settings and retained
release HTML/CSS/JS/plans. Exact literal URLs match all image outputs and recorded
old paths. This is not proof about arbitrary dynamically assembled JavaScript
URLs or external websites; the UI states that limitation.

Normal deletion rejects known usages with Conflict. The UI first displays the
usage list and then offers Force delete. force=true deliberately skips server
usage searches, metadata-review tokens and the caller's old expectedVersion.
The force request does not require expectedVersion at all. Authentication and
site/file ownership still apply; the store serializes catalog
writes normally. No additional confirmation dialog is shown. Deletion removes
the named outputs, private original/derivatives and corresponding asset metadata;
authored content and publications are left intact, potentially with broken links.

Validation, missing/foreign files, denied access and concurrent catalog changes
use the existing Validation/NotFound/Forbidden/StaleWrite outcomes. No partial
list truncation or automatic image-processing retry is introduced.

Media validation has precise HTTP error codes: `FileInvalidName`, `FileNameTooLong`,
`FileReservedName`, `FileEmpty`, `FileUnsupportedFormat`, `FileContentMismatch`,
`FileCsvEncoding`, `FileCsvContent`, `FileJsonContent`, `FileImageContent` (400),
and `FileImageTooLarge` / `FileDocumentTooLarge` (413). Responses omit raw parser
messages and private details. The Files UI translates each code and identifies
the failed filename; local read failures and byte-limit checks have corresponding
messages. CSV encoding is explicitly UTF-8; invalid encoding is never reported as
an invalid filename or excessive size.

## Storage and recovery

New-site onboarding uses the future domain for the directory name even when the
site is currently served from its development address. Creation prepares the
domain directory immediately when media storage is configured; switching the
selected origin does not relocate it. Existing directories are not migrated by
this change. See [ADR 0035](../adr/0035-site-onboarding-and-selected-origin.md).

Migration 0019 separates the site metadata in `media_libraries` from records in
`media_folders`, `media_files` and `media_operations`. It copies logical IDs,
prepared metadata, named paths and any pending journal in a per-site transaction.
Image bytes remain outside MongoDB. File timestamps start from available asset
timestamps and the logical creation time survives subsequent replacement.
Sites may use identical folder and file names independently. Catalog reads and
writes, private objects and named public directories are scoped by site identity;
the administration shows only the selected site's catalog.

Migration 0020 extends the existing journal with the staged entry and its
promotion state. A scoped transaction reserves the mutation, then the site
writer installs the affected named outputs. A second transaction promotes the
entry. Until promotion, CMS public reads use the preceding entry and its
immutable private outputs. The journal remains available through cleanup and
acknowledgement. Reconciliation of migrated pending journals and offline storage
migration can rebuild both named trees.
Only prepared usable outputs enter `<primaryDomain>/images` or
`<primaryDomain>/files`. Originals and prepared objects remain in
`<primaryDomain>/.private/`.

Finishing a pending projection reloads its matching catalog version while holding
the site writer lock, before changing named files. A delayed superseded/already
acknowledged finisher skips output, old garbage cleanup and acknowledgement.
Stage creation belongs to the lock's cleanup lifetime; a failed preparation cannot
strand its own empty writer.lock. The durable journal remains the recovery source.
Empty folders are catalog entries and need no public filesystem directory.

Filesystem changes and the MongoDB acknowledgement use separate transaction
boundaries. A static reader can briefly see 404 on an affected path. Bounded Windows
EPERM/EBUSY retries cover transient filesystem locks. Failed installation or
cleanup retains the durable pending state. Finish file update reapplies the
recorded path changes and completes idempotent cleanup. Reconciliation never reruns
image processing. The site writer queue serializes reconcilers and directory
relocations on the local host. Each participant includes the process ID and a
unique identity in its marker name. The next writer can reclaim a dead
participant even if it exited before publishing its ticket. Shared filesystem
writers on multiple hosts are unsupported.

Named output installation is followed by cleanup of superseded/deleted private
asset versions. Cleanup remains journaled until acknowledged. Backups must include
both MongoDB and the configured media root. No automatic orphan garbage collector
is added.

## Delivery and HTML

With ZARYA_MEDIA_ROOT and ZARYA_MEDIA_PUBLIC_PATH configured, public composition
serves GET/HEAD named outputs using registered site hostname resolution and owned
catalog paths. Unknown hosts, missing files, removed or old paths return
404. URLs are `/assets/images/<path>` or `/assets/files/<path>`, selected by
the trusted registered hostname. Public lookup uses the indexed path in the
active file record. GET and HEAD pin the selected content before responding.
ETag derives from that file's asset version. A replacement keeps the file ID,
name, public paths and logical creation date. Preparation failure leaves the
previous content available.

The default `ZARYA_MEDIA_ROOT=./data` contains one directory per primary domain.
A static web server maps `/assets/images/` to `DATA_ROOT/<domain>/images/` and
`/assets/files/` to `DATA_ROOT/<domain>/files/`, using its validated domain mapping.
Never expose `.private/`, `.storage-index/`, ownership markers or the whole data
root. Use revalidation and detected MIME/disposition configuration; extension
alone can differ after replacement. Generated publication assets use their own
`/assets/styles/` and script routes.

Changing the primary domain saves the new site mapping, then relocates the whole
site directory, including originals. Per-site writer locks serialize relocation
with uploads and projection installation. Failure is returned; repeating the site
update or accessing storage completes a pending move. The private index and
ownership marker recover a completed rename even if index replacement was
interrupted. A foreign destination directory is never overwritten.

The current library uses the owned layout above. Normal file moves/renames use
the guarded library operation below, preserving identity and the selected
reference-update policy.

Renaming/moving changes the filename-derived URLs of every output without
redirects. Before changing an address with known usages, the editor offers
Cancel, Update links or Keep old addresses (broken links). The confirmation
shows the current and proposed public addresses and the known usages. Usage
names link to the current editor when the actor can read that target. The optional
`updateReferences` boolean on MoveMediaFile defaults to false. True updates exact
literal references in editable templates, chunks and snippets, TV defaults, page
TV values, page bodies, Open Graph images and rendering parameters through
normal guarded saves. The source updates save drafts, including for Snippets.
Earlier file addresses in editable sources are repaired too, unless another
file has reclaimed them. Profile
variants retain their profile suffix and use the renamed file's stem. Typed Image/File IDs retain their identity. Site-owned absolute URLs and
encoded names are supported; foreign origins and filename prefixes are preserved.
Usage discovery includes TV defaults/values and typed file identities.
Update links also activates an immutable address-only copy of the current
publication and immediately purges the site's Request document cache, cancelling
scheduled/running refreshes. Frozen Build values and other published content are
preserved; unrelated draft changes remain unpublished. See
[ADR 0081](../adr/0081-immediate-published-media-address-updates.md).
Historical publications remain immutable. No media redirects are created.

Migration 0021 stores the file edit revision and unfinished link plan on the
file and in its staged projection entry. The file card guards edits by file
revision, so unrelated imports can advance the catalogue while conflicting
edits to the same file are rejected. The existing site fence still serializes
projection writes. Legacy requests can use the catalogue version.

File movement commits before sequential source saves. If a save or publication
fails, the new address remains active and the editor offers Retry link update.
Retry applies the saved address plan to drafts and the active publication
without projecting the file again. The plan survives a CMS restart and clears
only after both phases succeed. If another file occupies a planned old address,
free that address before retrying. An intentionally skipped link update creates
no recovery plan. Historical releases and dynamic URLs remain as authored.

A restricted picker sends its allowed MIME types with the upload. CMS inspects
the actual bytes and compares the detected type before storing a private asset.
The ordinary Files upload supports the full CMS type list.

Missing literal library URLs remain editable in source and TV fields with a
message below the field identifying the missing address. Missing typed files,
missing image outputs and failed previews retain their values and expose
warnings rather than preventing the editor from opening.

Change image replaces contents at the same
paths and does not save or publish pages. The frontend builder preserves configured
site-owned media URLs in img/srcset/picture/CSS rather than treating them as site
source files. Page Markdown permits safe img/picture/source markup while stripping
executable HTML and unsafe schemes.

Copy img and Copy picture use actual output dimensions and actual srcset widths,
deduplicating repeated widths. Without variants, picture contains only img.
With variants, sizes is editable layout input. Width chips use actual output
widths, with the largest selected initially; selecting a chip fills a fixed
pixel width. Authors can replace this with responsive layout expressions.
Copy buttons remain available; an empty sizes field shows an inline validation
message and receives focus when copying is requested. Width/height do not
assert that the image fills its viewport; template structural CSS still defines
the displayed layout. Existing authored HTML is not rewritten when Change image
changes dimensions; copy the updated markup where its geometry should change.
Clipboard success/failure feedback uses the shared SnackBar for 2000 ms without
changing the form layout. A clipboard failure keeps the selectable HTML available.
