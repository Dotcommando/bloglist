# Streamed file I/O

This is the required policy for future file work in CMS Zarya, under
[ADR 0048](../adr/0048-streamed-file-io-and-request-admission.md).

## File payload policy

Use streams for file transfer, reading, writing, copying and checksums. Memory
use for moving bytes must be bounded independently of total file size.
An AsyncIterable interface that first collects the entire file is not streaming.
Do not introduce readFile, toBuffer, Buffer.concat of all chunks, base64 JSON
uploads, FileReader/readAsDataURL or arrayBuffer as a file-transport mechanism.

Storage returns lazy repeatable byte iterables: obtaining metadata does not
open or read the file body. Filesystem reads use 64 KiB chunks. Writers await
each write, count actual bytes, enforce the accepted limit and reject truncated
or inconsistent declared lengths. Writes remain private/immutable until the
owning workflow acknowledges them. Duplicate immutable writes compare streamed
digests rather than materializing both files.

When processing requires random access, spool the stream to a private uniquely
named temporary directory. Detect content from the file, never the supplied
MIME. CSV and JSON uploads use incremental UTF-8 validation; JSON uses a streaming
verifier, not a full parsed document. SVG uses strict SAX parsing with active
content, external references and declarations rejected. Parser buffers are
bounded; SVG is limited to 256 levels and 256 attributes per element in addition
to the file byte limit. ICO directory entries are read in bounded pieces.

The media runtime configures libvips operation caching off once when loaded:
cached file loaders can retain temporary Windows file handles after an operation
has completed. Sharp reads staged files and writes derivatives to files. It does not collect
the uploaded original, a decoded raw raster or all encoded variants in JavaScript
Buffers. The existing 40-million-pixel bound still applies to native decoding.
Original dimensions, orientation normalization, alpha, no-upscale behavior,
WebP quality 92 and the responsive profiles remain unchanged.

Image inspection/processing results may own temporary resources and expose a
dispose operation. The receiving use case must call it in finally, including
when a storage or metadata operation fails and when not all variants are used.
The staging adapter removes partial data when input aborts or exceeds its limit.
Temporary-directory removal uses at most four filesystem retries with a 25 ms
base delay for transient Windows locks; it never retries image processing.

Parsing a bounded authored source or metadata record into the semantic value
required by its compiler/domain is separate from bulk file transfer. Existing
template/plan objects and bounded preview HTML necessarily exist as values.
That does not authorize using those parsing paths to buffer uploaded files or
to copy/download binary payloads. Keep source/record limits explicit; future
file adapters must follow the streaming policy.

## Administrative upload protocol

Both upload and replacement retain their existing POST paths:

- /api/admin/sites/:siteId/files
- /api/admin/sites/:siteId/files/:fileId/change

Headers:

- Content-Type: application/octet-stream
- Content-Length: exact raw file byte length
- X-Zarya-File-Metadata: encodeURIComponent(JSON.stringify(metadata))
- Existing same-origin Origin, X-Zarya-Admin: 1 and session Cookie.

Upload metadata contains expectedVersion, filename, folderId (nullable), mode
(Original or Responsive). Replacement contains expectedVersion and filename.
The complete encoded metadata header is at most 8192 ASCII characters;
duplicate metadata headers and unknown fields reject. The request body consists
only of file bytes. Images remain limited to 20 MiB, documents/JSON to 64 MiB.
Content encoding, missing/invalid lengths and legacy JSON/base64 uploads reject.
Actual byte counting remains authoritative even with a declared length.

The admin passes the original browser File as fetch body. It neither reads the
whole file into JavaScript nor expands it to base64. The browser supplies its
Content-Length. Existing validation codes, translated error messages, upload
modes, replacement naming and JSON success responses remain intact.

The Cloudflare gateway preserves X-Zarya-File-Metadata alongside the stream,
Content-Type and Content-Length for both upload and replacement. Its generic
X-Zarya header filtering must not strip this required input. The origin still
validates metadata and authenticates/authorizes the request independently.

All protected administrative routes pass AdminRequestGate before a controller
or runtime handler consumes body bytes. The owning application operation still
authorizes the actor and site. An Origin/custom header is not a secret and does
not authenticate a direct network client. Early rejected requests close the
connection instead of accepting an arbitrarily large unread body.

## Reading and delivery

Separate metadata/existence checks from file consumption. HEAD and a matching
If-None-Match must not trigger full file reads, checksums, CSP extraction or
image processing. Deleted files remain 404 rather than becoming a stale 304.
The publication adapter's metadata-only content cannot be iterated.

Full publication reads verify the immutable file's declared size/checksum before
returning a body; hashes use bounded reads. HTML CSP hashes are extracted with
a streaming HTML parser. The existing integrity check is not removed to make a
conditional response cheaper. Static routing selection validates its selected
release and manifest without re-reading every unrelated artifact.

GET honors response backpressure. An awaited drain must be cancelled on close
or error, and cancellation must return/destroy the source iterator. Public
documents retain request cancellation; media, admin file content, admin bundles
and runtime assets use the shared cancel-aware file-response helper. Never leave
a disconnected response waiting indefinitely for drain.

## Required regressions

For each new file endpoint or adapter, verify:

- A missing/revoked session fails before the first body read or expensive work.
- A slow multi-chunk client reaches the consumer before finishing the upload.
- Large payloads do not create whole-file Buffer concatenations.
- Declared-length mismatch, overflow and input abort clean up temporary data.
- HEAD/304 perform no body reads; deleted/foreign/private files are not exposed.
- Backpressure resumes on drain and stops on disconnect, closing the source.
- Content/MIME, immutable-write and checksum failures preserve existing outcomes.
- Temporary resources are released when later storage/metadata writes fail.

Use generated synthetic chunks, deterministic fake ports and disposable storage.
Keep exploitation regressions permanently. Do not use the owner's media,
database or application process as a test fixture.
