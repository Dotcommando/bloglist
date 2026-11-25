# Site dumps

Partial archives and runtime installation follow
[ADR 0042](../adr/0042-portable-category-dumps-and-runtime-addons.md).
Create accepts `{ type, itemIds?, addonParts? }`; omitting options preserves full
site creation. Exactly one type is permitted. Only Files and Site omit itemIds.
An add-on parts object contains configuration, businessData and package booleans.

`GET /api/admin/sites/:siteId/dumps/options/:type` returns the full export table.
`GET /api/admin/sites/:siteId/dumps/:filename/inspect` validates an archive and
returns its type, item choices/replacement targets, included add-on parts,
referenced source pages, owned target pages and an opaque review version.
Partial restore POST supplies `{ version, choices: [{ id, targetId }],
pageMappings?, addonParts? }`. Choices apply only checked items; Files uses an
empty choices array. The review version becomes stale when the archive, target
snapshot or relevant source catalogue changes. No partial import publishes.

`POST /api/admin/sites/:siteId/dumps/:filename/delete` removes a regular archive
and succeeds when it is already missing. List/download metadata includes type;
legacy version 1 complete archives without a type remain Site. Type is read from
the gzip header, never inferred from a user filename or a database entity.

`GET /api/admin/sites/:siteId/addon-runtime/:addonKey` returns null for a static
view or a digest, entry and stylesheet list for an installed runtime view.
`GET .../:addonKey/:digest/:asset` serves only declared admin JavaScript/CSS,
with the same active-administrator/site authorization. Server code is private.

Under [ADR 0041](../adr/0041-site-dumps.md), restoration replaces only the selected
existing site, including its add-on data. Other sites and global administrators
are unaffected. Creation/import do not restore. Restore requires confirmation
and reloads the editor after success to discard stale buffers and settings.

## Operations

All site operations require an existing site and the corresponding action grant.
Site Admin can list, create, upload and restore full archives for an assigned
site. System Admin can also download, delete and handle partial archives. Local
operations require the configured trusted operator identity.
HTTP retains Host/Origin, cookie, custom-header, no-query and no-store protection.

| Operation | REST route | Input / result |
| --- | --- | --- |
| ListSiteDumps | GET `/api/admin/sites/:siteId/dumps` | `{items: [{filename, byteSize, createdAt}]}` |
| CreateSiteDump | POST `.../dumps/create` | Empty JSON object / metadata, 201 |
| GetSiteDump | GET `.../dumps/:filename` | Private gzip attachment |
| ImportSiteDump | POST `.../dumps/import` | Raw gzip with Content-Length / metadata, 201 |
| RestoreSiteDump | POST `.../dumps/:filename/restore` | Empty JSON object / `{restored: true}` |

Malformed, corrupt, foreign or incompatible input returns Validation/400; missing
files return 404; authentication/access errors 401/403; maintenance/stale state
409; oversized upload 413. Unexpected failures are sanitized. A lost response is
not proof of failure: refresh and inspect state before repeating a mutation.

Settings / General retains addresses and IANA time zone. Settings / Dumps lists
filename, binary size in KiB/MiB/GiB/TiB and creation date in that configured zone.
Refresh/tab activation rescan disk. No database records or sidecar catalogue are
created. Vanished files simply disappear; an explicit missing download is 404.

Export and upload forms use borderless tinted groups separated by whitespace.
They share two desktop columns from 992px and stack below that breakpoint.
The saved-dump heading owns Refresh. Tables group rows with background and spacing;
selection uses the shared Checkbox component with caption and keyboard operation.
The existing general-settings tab and independent scroll shadow remain mounted.

## Installation archives

System Admin uses a separate panel under Settings / Dumps. The route site
identifies the serving process for creation. The archive always covers the
installation.

Create and Restore use the same responsive cards as site transfers.
The restore card uses the shared CMS file selector for the local archive.

| Operation | REST route under `/api/admin/sites/:siteId/dumps/installation` | Input / result |
| --- | --- | --- |
| Create | POST `/create` | Empty JSON object / metadata, 201 |
| Download | GET `/:filename` | Private gzip attachment |
| Restore | POST `/restore` | Raw gzip with Content-Length / `{restored: true}` |

The archive includes MongoDB data and the configured source, media and
publication stores for every site. It requires matching installed schema,
migration receipts and add-on packages. Provision environment, secrets and
binaries separately. Active admin sessions are revoked on restoration and
dump history is kept outside the archive. Site and installation archives have
different headers. Each restore route rejects the other archive's format.

Installation restore validates and stages data, then coordinates file swaps
and a majority MongoDB transaction under the maintenance lock. Recovery uses
the committed operation ID to decide which files to retain.

## Files and format

`ZARYA_DUMPS_ROOT` defaults to `./dumps`, separate from sources, media, publications
and admin assets. Completed archives are `<siteId>/<UTC instant>_<UUID>.jsonl.gz`.
Import preserves the header creation instant in a new unique filename. Storage
must be private and persistent; Compose mounts source, dump, media and artifact
volumes. Do not expose them under an unrestricted static alias.

Gzip contains UTF-8 newline-delimited records: a version-1 zarya-site header,
base64 BSON documents, directories, file headers, 64 KiB binary chunks, file-end
SHA-256 checksums and a final SHA-256 over preceding lines. Complete framing,
declared sizes and gzip integrity are required. Checksums are integrity checks,
not signatures or encryption. Downloads contain complete private site data.

The header records site identity, creation instant, installed schema signature,
collection list and owned source/media/release layout. BSON preserves technical
types including Int64 and Double. Site-owned collections require `siteId` in the
installed `$jsonSchema` validator. Restore reuses installed schemas/indexes and
does not replace global migration receipts or install add-on packages.

Publication release directories use the registered primary domain under
[ADR 0046](../adr/0046-primary-domain-publication-directories.md); old source-key
archive layouts remain accepted. Restoration rebuilds publication ownership and
its private domain index without changing release identities.

Capture includes the located source directory, domain-owned media (including its
private subtree) and all retained Ready release files, manifests and Request
plans. Existing dump files and transient compiler output are not recursively
included. The media storage index is rebuilt from the restored primary domain.

File-only JSON and legacy template/chunk HTML/CSS/browser-TypeScript sources are
adopted into snapshot database records. Missing JSON copies are generated from
database sources; stale copies do not override them. Registry keys remain stable.
TypeScript configuration must export literal data (optional `as`/`satisfies`
wrappers), without imports, calls or executable statements. Bundled elements
continue to come from the compatible installed engine.

Reject links, devices, traversal, duplicate/case-colliding paths, foreign site
documents and occupied foreign target directories. Validate publication manifests
and artifact sizes/checksums before touching live directories.

## Consistency and recovery

Use the CMS supervisor's coordinated serving processes and quiescent external/local writers. The shared gate drains
requests for up to 30 seconds. During creation it then permits public GET/HEAD
and administration reads, while conflicting HTTP writes and the hook mutation
worker remain blocked. Snippet clients created during capture are query-only.
Restoration retains the all-request 503/Retry-After gate. A durable filesystem
operation lock serializes dump mutations; it is held by the parent across child
capture. PID-scoped admissions, a private filesystem gate and one supervisor
coordinate all serving processes. Uncoordinated external/local writers must
remain stopped. Startup recovery completes before workers become public;
orphan workers stop on supervisor disconnect. Each process observes mutation
epochs to invalidate its own publication, rendering and add-on caches. Only the
supervisor runs mutable background hook work.

Database export uses snapshot read concern. Restore validates/stages,
captures current scoped state, checks it inside the replacement
transaction and commits with majority concern. Journaled directory swaps retain
previous files. Known aborts roll back files; unknown outcomes compare database
fingerprints. Unmatched results block service. Startup removes dead-process locks
and reconciles journals before listening; invalid/unresolved journals fail closed.
Free space is needed for archives, staging and rollback copies. Failed writes
are not listed as completed dumps. Operations do not retry automatically.

## CPU-aware capture

[The resource contracts](0.14.0-site-process-allocation.md) and
[ADR 0082](../adr/0082-site-process-allocation.md) introduce site process budgets,
temporary serving-slot lending and in-process capture when no slot is available.
At least two assigned site processes means lending one of that site's processes,
even if other capacity is free. Drain/stop a sibling of the requester, run the
capture child, reap/clean it, and restore the serving process. Other sites never
lend workers. A single-process site runs capture in its serving process
regardless of the unallocated CPU budget. Inline capture can stall the site and cannot interrupt synchronous JavaScript work
mid-instruction. Cancellation is checked before admission/capture and after work;
child deadlines/termination apply only when a child is used. Failure still returns
through the existing operation and cannot publish a partial Ready archive.
Admission serializes resource edits and captures; failures restore borrowed
capacity or expose the failed replacement. The UI shows desired/running counts.

## Capture child safeguards

ADR 0075 defines the safeguards used for complete/category exports whenever
the adaptive policy selects a child. The initiating request keeps the existing pending/busy
behavior and returns completed metadata; there is no added queue or numeric
progress. List/download/restore formats and authorization remain unchanged.
Only the completed archive is atomically moved into the site's ordinary dump
directory after matching job/site/process identity, valid metadata and exit zero.

The serving requester holds the operation lock. Under ADR 0083 the coordinator
directly forks capture and records both its actual parent PID and the requesting
operation owner's PID, plus the child PID and site. Standalone local capture keeps
parent and operation owner equal. The child verifies its actual parent and both
lease owners before and after capture. Requester loss cancels/reaps capture before
the coordinator reconciles a dead read-only capture owner and releases its write
gate. A live owner, changed lock or interrupted restore never permits that recovery. Staging lives below a checked private job directory;
recovery refuses live owners and removes abandoned staging only after both
owners are dead. Symlink/traversal checks apply to lease/staging cleanup.

One process, no queued job, 512 MiB old heap, a 30-minute deadline and a separate
MongoDB pool of at most two connections bound capture. IPC carries at most 2 MiB
of metadata per message; archives remain streamed files. Credentials enter only
the child bootstrap environment and are absent from job IPC, leases and logs.
Spawn/IPC failure, crash, timeout, abort and parent shutdown reject capture,
terminate/reap the child and clean staging before admission is released. Failed
captures never appear as completed archives. A lost successful HTTP response is
reconciled by rescanning the ordinary archive list.

## Verification

Fake-port and composition tests cover authorization, scope and contracts. File
tests cover catalogues, disappearance, links, framing and corruption. Isolated
MongoDB tests cover all five operations, file-only source adoption, private bytes,
exact integers, releases, site isolation and rollback after failed file swaps.
Production-bundle browser tests cover authentication, creation/download/import/
restore, preserved general inputs, both languages, keyboard focus, tab shadows,
zoom and the shared viewport matrix. Chromium does not prove iPhone Safari
device compatibility.
