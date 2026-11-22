# Boundary limits

The internal runtime `publishedPages.findPublished` capability accepts at most 128 distinct page identities in one trusted site scope. It captures one active release and returns a complete membership result; it never truncates the input (ADR 0069).

Cloudflare deployment output follows the provider's 25 MiB per Static Asset file
limit. Larger public library media is reported as origin-served without changing
the CMS upload contract; larger publication artifacts fail preparation. This is
a file-size limit, not API pagination or an encoded HTTP body limit. See
[Cloudflare deployment](cloudflare-deployment.md).

| Exchange | Unit | Limit / behavior |
| --- | --- | --- |
| JSON-LD catalog save POST | Actual UTF-8 bytes | 1 MiB; authenticated site-scoped JSON, explicit fields, no content encoding |
| JSON-LD catalog | Profiles / objects / nodes / mappings | 256 profiles, 1024 shared objects, 64 nodes per profile, 128 mappings/properties per node/object; rejection without truncation |
| JSON-LD property list / value path | Scalar values / path segments | 1024 list values; 8 path segments; forbidden prototype names reject |
| JSON-LD reference picker | Visible suggestions | 10 per local search page over the complete authorized catalog; no server-result truncation |
| Markdown/JSON-LD inspection GET | Scope / body | Saved draft or one active release; no request body; no-store/noindex and editor access |
| Site dump create/restore POST | Encoded UTF-8 bytes | 8192; empty JSON object, strict administration origin/custom-header checks |
| Site dump import / completed archive | Compressed bytes | 16 GiB; raw application/gzip with explicit Content-Length; no HTTP content encoding |
| Site dump decompression | Expanded bytes / record bytes | 64 GiB total; 24 MiB per UTF-8 record; 64 KiB decoded file chunks; overflows reject without live replacement |
| Site dump catalogue / database snapshot | Records | Complete site-scoped results, no truncation or added pagination |
| Add-on repository installation POST | Actual unencoded UTF-8 bytes | 8192; repositoryUrl only, maximum 2048 characters; authentication before body/network access |
| GitHub add-on API JSON | Actual decoded UTF-8 bytes per response | 1 MiB; no JSON redirects or implicit pagination/truncation |
| GitHub App signing keys | Files / actual bytes per file | At most 25 directly contained PEM files, each at most 16 KiB |
| Add-on release download | Actual compressed bytes / elapsed network time | 64 MiB, exact declared asset size, 60 seconds across authorization, release, commit and download requests; at most 3 approved-host redirects |
| Add-on release archive | Actual expanded bytes / record bytes | 256 MiB total, 128 KiB per JSONL record, 64 KiB decoded chunks; at most 2048 files (64 MiB each) and 4096 total entries; paths 2048 characters and depth 16 |
| Add-on delivery/activation | Concurrent operations per process | 1 each; excess operations reject with 409, no queue |
| Add-on installation metadata GET | Records | Complete global package list for an authorized administrator, without private actor identifiers |
| Add-on enable/configure/disable POST | Encoded UTF-8 bytes | 16,384; strict JSON fields, no content encoding; overflow returns 413 |
| Add-on management target / key / version | Characters | Target 4096; site identity 128; addonKey 64; expectedVersion 256; no query parameters |
| Add-on configuration | Value nodes / nesting depth | Maximum 1024 nodes and depth 16; complete rejection without truncation |
| Add-on administrative catalog | Definitions / connections | Complete site-scoped union, sorted by addonKey, without configuration values or added pagination |
| URL move/redirect and site settings REST POST | Encoded UTF-8 bytes | 8192; explicit JSON fields only; no content encoding; overflow returns 413. One transliteration table per request, up to 96 rules in each of the edited and captured tables and 16 characters per replacement |
| Routing-only publication REST POST | Encoded UTF-8 bytes | 8192; empty JSON object only; no actor or graph supplied by the caller |
| URL/settings administration request | Characters | Target 4096; identities 128; path/origin 2048; redirect version 256; query parameters rejected |
| URL catalog and history | Records | Complete site-scoped results without truncation or added pagination |
| URL suggestions GET | Records / query characters | Default/max limit 10, positive integer; offset nonnegative safe integer; q at most 2048 characters; currentUrlId at most 128; purpose Parent or Redirect; target at most 4096; unknown/duplicate fields reject |
| Document MIME | ASCII characters | At most 255, validated type/subtype without parameters; malformed values reject without fallback |
| Published robots rules parsing | Actual UTF-8 bytes | 1 MiB; overflow fails publication/diagnostics, no truncation or rule weakening |
| Sitemap artifact | URL entries / encoded UTF-8 bytes | Maximum 50,000 unique URLs and 50 MiB; larger output fails publication without activation |
| Local media upload, images | Actual input bytes | 20 MiB (20 * 1024 * 1024); overflow rejects the upload |
| Files upload / Change image REST POST | Actual binary body bytes | Raw application/octet-stream with exact Content-Length; image limit 20 MiB, document/JSON limit 64 MiB; no content encoding or base64 JSON fallback |
| Site favicon GET / POST | Response metadata / actual binary body | Authorized editor; POST uses raw octet-stream with exact Content-Length and filename-only metadata; real ICO inspection; maximum 20 MiB; replacement is immediate and atomic |
| Files upload metadata header | Encoded ASCII characters | X-Zarya-File-Metadata: at most 8192 characters of percent-encoded JSON; duplicate headers/unknown fields reject |
| Filesystem payload streams | Bytes per read chunk | 65,536; writes await each chunk; actual byte counts and declared lengths are checked |
| SVG syntax | Nesting levels / attributes per element | At most 256 each; strict SAX parser retains its 64 KiB token-buffer bound |
| Files metadata REST commands | Encoded UTF-8 bytes | 16,384; explicit JSON fields only; overflow returns 413 |
| Files administration request target | Characters | 4096 total; identifiers maximum 128; only declared usages/content queries accepted |
| File/folder display name | UTF-16 code units | 1..180; validated portable names, no traversal, control characters or Windows reserved device names |
| Files catalog / usage lists | Records | Complete scoped results without truncation; no extra pagination count is introduced |
| Local media upload, PDF/DOC/DOCX/CSV/XLS/XLSX/JSON | Actual input bytes | 64 MiB (64 * 1024 * 1024); overflow rejects the upload |
| Raster decoding | Decoded source pixels | 40,000,000; larger input rejects before decoding |
| Internal due-series query | Series per page | 100; keyset loop processes every page |
| Recurrence expansion | Calendar window | One year ahead in each series zone; weekly replenishment, no lifetime occurrence ceiling |
| Local administration-user list | Profiles per page | Default 20, maximum 100; invalid limits reject, no silent truncation |
| Private admin-creation stdin | Encoded UTF-8 bytes | 8192; exactly two LF-terminated lines, email then password |
| Administration password | Unicode code points | 15 through 1024; full input is hashed without trimming/truncation |
| Admin authentication POST | Encoded UTF-8 bytes | 8192 actual bytes; JSON object only; oversized input returns 413, content encoding is rejected |
| Site creation REST POST | Encoded UTF-8 bytes | 8192 actual bytes; explicit JSON fields only, no content encoding; overflow returns 413 |
| Page creation/draft update REST POST | Encoded UTF-8 bytes | 1 MiB (1024 * 1024) actual bytes including JSON encoding; no content encoding; overflow returns 413 |
| Page/full-site publication REST POST | Encoded UTF-8 bytes | 8192 actual bytes; explicit JSON fields, no content encoding; overflow returns 413 |
| Publication path / template selection | Characters | Path maximum 2048; template key is a registered portable identifier; invalid/reserved paths reject |
| Page move REST POST | Encoded UTF-8 bytes | 8192; parentPageId, expectedParentPageId and expectedSortOrder only; overflow returns 413 |
| Numeric page ID | Decimal characters | Canonical positive string, 1..9223372036854775807; backend-assigned per site, immutable |
| Page sort order | Integer value | 0..9007199254740991; independent of page ID; moves preserve the value |
| Site/page administration REST target | Characters | 4096 total; site/page identifiers maximum 128 each; no query parameters |
| Site/page administration REST lists | Records | Complete existing ListSites/ListPages result, without added count limit or truncation |
| Publication options availability | Page routing summaries | Complete site-scoped union of working PAGE bindings and active page routes; a page request returns only that page, including null paths |
| Admin authentication login password | Unicode code points | Maximum 1024; incorrect shorter passwords still undergo verification |
| Admin login failure admission | Failed attempts per normalized email and trusted socket source | Existing 15-minute window; tenth failure starts a 15-minute pause; both counters are persisted; email rotation does not reset the source counter |
| Admin HTTP login concurrency | Active operations per HTTP process | Maximum 2; no queue; excess requests receive 429 and Retry-After: 1 |
| Admin authentication session list | Profiles per page | Default 20, maximum 100; opaque owner/version-bound keyset cursor |
| Admin authentication target | Characters | 4096; session ID in revoke route maximum 128, session-list cursor maximum 2048 |
| Admin authentication Cookie header | Characters | 4096; duplicate session cookies reject |
| Admin authentication device metadata | Characters | User-Agent maximum 1024, socket address maximum 128; reject rather than truncate |
| Template/chunk create and update POST | Encoded UTF-8 bytes | 2 MiB including JSON encoding; unencoded JSON only; overflow returns 413 |
| Template/chunk preview POST | Encoded UTF-8 bytes | 8192; pageId and expectedVersion only |
| Element registry key | ASCII characters | New keys: canonical decimal 1..9223372036854775807 assigned by backend; legacy letter-led keys remain valid up to 128; no key in create body |
| Element display name | Characters | Required nonblank one-line name, maximum 200; independent of key and not necessarily unique |
| Chunk name reference | Characters | Up to 200; each whitespace becomes `_`; Unicode letters/marks/numbers plus `_`, `.` and `-`; exact key wins, ambiguous names reject |
| Element parameter contract | Schema nodes / nesting depth | Maximum 256 parameter nodes per element and depth 16; invalid complexity rejects without truncation |
| Template/chunk lists | Entities | Complete merged result, with no added count limit or truncation |
| Snippet create/update POST | Encoded UTF-8 bytes | Existing element boundary: 2 MiB including JSON encoding; no content encoding |
| Snippet server source | UTF-16 code units | 1..100000; complete source rejects on overflow |
| CMS server object API list | Records per result | Default limit 50, offset 0; positive/nonnegative safe integers; no numerical upper cap, no silent truncation; distinct from existing REST/owning-port windows |
| CMS worker operation path | Named components | Core object/method: 2; extensions/addon/object/method: 4; own registered methods only, unknown paths reject |
| CMS file data in server API | Integer byte values | Arrays of 0..255 with declared byteSize/mimeType; existing actual file-size and worker memory/output budgets apply independently |
| Snippet result | Encoded UTF-8 bytes | 2 MiB of JSON per worker; overflow rejects execution |
| Snippet execution | Elapsed time / worker memory | Existing configured loader deadline plus a 10-second worker ceiling; worker old generation 64 MiB, young generation 16 MiB, stack 4 MiB |
| Pagination snippet | Items / numbered links | Default pageSize 10, allowed 1..100; at most nine navigation links; query input uses page, never limit/offset |
| Private compiled preview | Actual artifact / embedded document bytes | Maximum 16 MiB per build and resulting document; 64 MiB retained documents per process; explicit failure on overflow |
| Private preview lifetime | Elapsed time | Ten minutes; a new preview replaces the same actor/site/page's previous document |
| Add-on menu override | UTF-16 code units per interface language | 0..80; blank uses the registered default |
| Add-on view navigation query | Characters | Maximum 2048; kept inside the registered site/add-on route |
| Session-series administration list | Entities | Complete authorized same-site results, no date horizon or truncation |
| Site time-zone setting | ASCII characters | 1..128; named IANA zone, guarded by expectedTimeZone; numeric offsets reject |
| Hook administration POST | Encoded UTF-8 bytes | 2 MiB; unknown fields and overflow reject |
| Deployment configuration/retry/check POST | Encoded UTF-8 bytes | 8192; explicit JSON fields only, no content encoding; overflow returns 413 |
| Deployment administration target / fields | Characters | Target 4096; site identity 128; strings 2048; destination name 200; no query parameters |
| Deployment status / diagnostics response | Records | One configured target and current delivery summary per site; complete typed diagnostics without provider payloads or credentials |
| Hook source / title / grants | UTF-16 units / entries | Source 1..100000, title 1..200, at most 32 grants |
| Hook configuration and filters | Encoded UTF-8 JSON bytes | 16 KiB each; JSON depth 16 and at most 1024 visited nodes |
| Hook candidate / fact / detail | Encoded UTF-8 JSON bytes | 64 KiB each; the same JSON structure limits apply |
| Hook recipients | Bindings per hook per source operation | At most 128; reject excess rather than truncate |
| Hook execution | Elapsed time / worker memory | Check 1 second, event 10 seconds, combined checks 5 seconds; old generation 64 MiB, young 16 MiB, stack 4 MiB |
| Hook worker result | Encoded UTF-8 JSON bytes | 2 MiB; validate before accepting the plan |
| Hook command plan | Commands / causal depth | 32 per delivery, 256 per causal chain, depth 16 |
| Hook query bridge | Queries per evaluation | Maximum 32; overflow terminates the evaluation |
| Hook delivery journal response | Records | Latest 200 site deliveries; explicit response window, not a complete historical export |

These local stream/worker limits are not HTTP encoded-body limits or public
pagination contracts. Future network adapters must define their own encoded
request/response limits without changing these business stream limits.

Category dump create/restore selection commands accept at most 4 MiB of actual
unencoded JSON bytes, including checked item identities and explicit page mappings.
This does not limit catalogue counts: lists return the complete category.
The existing dump limits remain 16 GiB compressed, 64 GiB expanded, 24 MiB per
JSONL record and 64 KiB per binary chunk. A runtime package is carried inside the
same bounded archive stream, with SHA-256 verification of every declared file.

TV definition and page-value POST requests accept at most 1 MiB of unencoded JSON
body bytes each. Catalogs return all fields without pagination or truncation.
The separate business structure limits are 256 definitions/values per site/page,
128 ASCII characters per technical name, 200 characters per caption and 2000 per
description. These counts are not byte limits or pagination settings.

## CMS 0.12.0 internal execution boundaries

| Exchange | Unit | Limit / behavior |
| --- | --- | --- |
| Verified publication catalogue | Entries / accounted bytes / active reads | 128, 32 MiB, 128; oversized verified results returned without retention; excess reads reject |
| Document refresh scheduling | Entries / accounted input bytes | 256 / 8 MiB; TTL >20 seconds; trigger at expiry minus 20 seconds |
| Background document admission | Jobs per process | 17 including one active Worker and up to 16 queued; foreground fill capacity reserved |
| Refresh Worker transfer | UTF-8 JSON bytes per input, bridge reply or result | 8 MiB; overflow rejects without retry or main-thread fallback |
| Refresh Worker queue / total deadline | Milliseconds | 1000 / 10000, including admission wait |
| Refresh Worker memory | Accounted queued inputs / V8 heaps and stack | 32 MiB / 256 MiB old, 32 MiB young, 4 MiB stack; one Worker, no new MongoDB pool |
| Refresh data bridge | Calls per document | 2048; frozen cache-safe context and existing loader/Snippet admission |
| Dump child admission | Processes / queued jobs | 1 / 0; excess rejects with conflict |
| Dump child execution | Deadline / V8 old heap / MongoDB connections | 30 minutes / 512 MiB / at most 2 |
| Dump child IPC | UTF-8 serialized metadata bytes per message | 2 MiB; identities/settings only, no archive payload or database credentials |
| Dump lease record | Actual file bytes | 8192; checked private job root and parent/child process identity |

Database credentials enter the dump child through a private bootstrap environment
value, not job IPC, lease files or logs. These are adapter/composition limits,
independent of public list counts, request-body sizes and archive-stream limits.

## Site favicon removal

POST `/api/admin/sites/:siteId/favicon/delete` accepts only an empty JSON object.
Its complete JSON request body is limited to **1024 bytes**. The administrative
session/Origin boundary is checked before reading the body. This limit is
independent of streamed ICO upload byte limits.

## Administrator management REST

Under ADR 0059, POST /api/admin/users and its /:id/password, /:id/block and
/:id/delete operations accept at most 8192 encoded JSON request-body bytes.
The existing account policy independently bounds passwords to 15–1024 Unicode
code points. JSON encoding overhead does not change that policy. At most two
creation/password derivations run concurrently per HTTP controller process;
excess work returns 429 with Retry-After before derivation, without a queue.
GET /api/admin/users retains the existing keyset page size: default 20, maximum
100 accounts, with opaque nextCursor and no silent truncation.

## Page resolution diagnostics

GET /api/admin/sites/:siteId/page-resolutions uses the existing 4096-character
administrative target boundary. Site identity is at most 128 characters; a CMS
version is at most 80 characters; each calendar endpoint is ten ASCII characters
(YYYY-MM-DD). Unknown and duplicate query fields reject. Responses contain the
complete grouped path table and retained version list, without truncation or a
new pagination limit. Each MongoDB statistics query has a 10-second budget.

Private internal observations contain at most 256 stages and a path of at most
4096 characters, without domain/query/fragment. The process admits at most 4096
pending records with one active write. Overflow and failures are explicit
site-scoped counters, without retrying or delaying public delivery. Stage cleanup
observation and shutdown drain each have a two-second window. These internal
counts and elapsed budgets are independent of encoded HTTP request-body limits.

## Public document navigation query

Under ADR 0067, Node HTTP and the Cloudflare edge share the same public-query
parser and limits: at most 12288 UTF-8 bytes in the raw encoded query (excluding
`?`, including separators/percent encoding), 128 name/value pairs including
repeats, and 256 UTF-8 bytes per decoded name. Values have no additional tighter
cap; they share the total query budget. Unknown names/values are accepted and
omitted from rendering. There is no marketing-provider allowlist.

Overflow returns 414 with no-store before site/renderer work or edge proxy/assets;
there is no truncation. Malformed URI encoding remains 400. Repeated names form
arrays; declared scalar values retain strict validation, while undeclared values
are ignored. The browser URL and proxy query remain intact. These are query-only
limits, separate from path rules, HTTP headers, upstream URL limits, administrative
API contracts and template/Snippet schema limits.

## Installation processes and CPU telemetry

GET/POST `/api/admin/installation/resources` requires the active administrator
session and trusted administrative boundary before body admission. POST accepts
at most 65536 encoded JSON bytes. Configuration versions and site identities
are at most 128 characters; site allocations are a complete list, without silent
truncation or a pagination cap. Quota precision is 0.1 CPU; site counts are positive
integers. The optional `sitePoolSize` is a positive safe integer maximum for each
site-serving database pool, independent of the site-process count. It may change
without modifying an otherwise fixed one/two-CPU allocation. Optimistic versions
and one resource/dump admission owner serialize edits.

The private deployment helper accepts at most 8192 request bytes and its local
client accepts at most 1 MiB of response metadata, with a ten-second exchange
deadline. Only GET/PUT `/limits` are available with a private 256-bit key. Container
selection uses configured Compose project/service labels, never caller-supplied
container IDs, socket paths or commands. Persisted overrides contain quotas only.

The read-only administrator WebSocket `/api/admin/installation/cpu` admits at
most 16 subscribers and 16 concurrent authorization handshakes. Incoming frames
are bounded to 1024 bytes; any application message closes the read-only channel.
Outgoing samples and buffered bytes each have a 65536-byte ceiling, with no
compression or missed-sample queue. Sample interval is one second, heartbeat
15 seconds, dead-client expiry 45 seconds. Host/VM counter observation accepts at
most 2048 logical CPUs. Counter deltas outside 0.5–2.5 seconds, topology/source
changes or resets produce unavailable points. Only each browser retains its last
300 points per CPU; the server retains previous counters, not chart history.

Private serving-worker/coordinator IPC uses UUID requests (maximum 64 characters),
metadata only, and a 35-second admission/release response deadline. Capture RPC
allows the existing 30-minute child deadline plus 35 seconds for supervision;
cancellation is acknowledged only after child exit and cleanup. A lost
acknowledgement disconnects the uncertain worker for coordinator recovery.
Requests carry at most 2 MiB metadata; binaries stay in streamed private files.
Worker readiness/drain and shared write-admission draining each have a 30-second
deadline. Capture and resource changes have no queue.

No aggregate memory or connection allowance determines a maximum serving-worker
count. `ZARYA_PROCESS_MEMORY_BUDGET_MB` and `ZARYA_PROCESS_CONNECTION_BUDGET` are
removed. Container memory limits are deployment settings. Each ordinary process
uses a MongoDB pool configured with `ZARYA_MONGO_MAX_POOL_SIZE` (default 5);
the capture pool remains at 2. Driver monitoring sockets are additional to pool
maxima. CPU recommendations are advisory; process counts remain positive integers.
Coordinator, serving and capture CPU work share the CMS quota.

Resource-application feedback stays visible for at least 400 ms, including fast
successful replies. This is a browser feedback interval, not a server admission
limit or a delay to resource application. The loader follows the visible form
intersection through scrolling and resizing. A completed save is labelled as
saved and becomes editable again on the next input change.

The resource-settings browser client bounds state reads to 10 seconds and
allocation submissions to 120 seconds, including response-body decoding. A
timeout does not prove that server-side changes failed: the form releases its
apply state and reconciles actual saved/running counts with a bounded read.
Requests that reject after the deadline remain observed. Background reads have
separate progress state and cannot block editing or overwrite a newer save/edit.


## Calibration administration and helper exchanges

Calibration profile create/update bodies are limited to 65,536 decoded UTF-8 JSON
bytes. Run start/apply/cancel bodies are limited to 8,192 bytes. Authentication
and installation-administrator checks precede body consumption. Compression is
not accepted. Profile list pages contain 1–100 profiles, default 20; cursors are
opaque identifiers. The Main history returns the ten most recent relevant runs.

The private helper load request is limited to 65,536 JSON bytes and its response
to 1,048,576 bytes. Its independent generator uses keep-alive and a 10-second
HTTP request timeout. A measurement has a parent deadline of warmup + measurement
+ 15 seconds; the helper client allows another 5 seconds for exchange/cleanup.
Closing the helper request cancels and reaps its generator. Public calibration
reads have a 10-second browser deadline and mutations 120 seconds; the longer
experiment is a separately observed background operation. These byte/time/page
limits do not cap the installation's worker count or database connection budget.

## Live add-on update and control transport

| Exchange | Unit | Limit / behavior |
| --- | --- | --- |
| Add-on update upload | Actual compressed bytes | 64 MiB, exact Content-Length, application/gzip; existing 256 MiB expanded archive bounds; authenticate before the first body read |
| Update manifest routes | Prefixes / characters per prefix | 32 prefixes, 512 characters; named path segments and an owning add-on key |
| Update apply | Concurrent installation operations / body bytes | One admitted operation, no queue; empty body; explicit identity for status/reconciliation |
| Retiring process | Elapsed milliseconds | 20,000 including shutdown notification and drain; forced termination followed by a 2,000 ms exit acknowledgement deadline |
| Private control-resource IPC | Elapsed milliseconds per request | 65,000; structured metadata only, no runtime/file payloads; unknown acknowledgement requires reconciliation |

Calibration 0.15.0 permits at most 8 public GET steps per page scenario and 32
declared queries per add-on. Each API path is at most 4096 characters. Profile and
private generator bodies retain their existing 64 KiB authentication-before-read
limit; helper responses retain their 1 MiB limit. The host resolves site/page and
UTC-window placeholders, never arbitrary hosts or administrator credentials.
