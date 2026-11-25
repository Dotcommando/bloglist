# Candidate verification

- Projection regression failed with the missing delta installer on the original
  adapter. It passed after implementation, including a forced preparation
  failure, retry, rename and deletion with an untouched sibling.
- Focused application, adapter, boundary and release-consistency tests passed
  71 checks with loopback access enabled for the HTTP test.
- A MongoDB 8.0.29 replica set in a dedicated temporary container exercised
  normalized records, retry of a migrated legacy pending operation, and
  partial Files export and restore. The restore tests preserve existing IDs
  for matching logical files and validate private asset metadata and bytes.
- The built administration exercised Files in Chrome at desktop and mobile
  sizes, including folder disclosure, list/grid switching, file opening and
  uploads. One drawer locator needed scoping after the browser added
  breadcrumbs. The targeted rerun passed.
- The scoped server facade exercised parallel streamed uploads, one rejected
  batch item, idempotent folder creation, replay and batched metadata reads.
  The optional external synthetic add-on fixture was unavailable.

## Synthetic metadata measurements

The fixture seeded one folder and generated file metadata in batches. It read
page 2 with 25 entries, ran a recursive name search from the root, resolved a
single named output and added a file to the root. The append measurements
include the metadata transaction and journal acknowledgement. The named-output
installer is stubbed for this benchmark. Browser and filesystem scenarios run
in the separate Files integration suite.

| Seeded files | Page ms | Search ms | Output lookup ms | Append ms | Page JSON bytes |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 11 | 29 | 3 | 28 | 12,012 |
| 10,000 | 13 | 207 | 3 | 25 | 12,041 |
| 50,000 | 22 | 345 | 3 | 31 | 12,041 |
| 100,000 | 36 | 668 | 4 | 24 | 12,043 |

The browse response is bounded by the page size. Counting matching rows,
substring search and deep offsets still have corpus-dependent costs.

## Confirmed defects

- [Split catalog order drift](../../../defects/media/split-catalog-order-drift.md),
  bug discovered in the candidate, fixed and checked by the Files integration.
- [Batch storage writer contention](../../../defects/media/batch-storage-writer-contention.md),
  bug discovered during SDK integration, fixed and checked by the streamed-batch scenario.

## Initial candidate gaps

- Some legacy callers still read a full site snapshot. Legacy mutations return
  that snapshot and still share a catalog version. The original tree and move
  destinations still use this interface.
- Tile previews reuse an available derivative. Original-only files show a type
  icon while on-demand thumbnail preparation remains open.
- Durable add-on reference declarations, deletion fencing for concurrent
  assignments, and portable remapping of add-on business data remain open.
  Existing IDs and add-on data are preserved by the in-place migration.
- Programmatic retry identities are tied to live logical file records. A
  deleted file has no durable upload receipt. Journal admission still goes
  through a per-site fence. The external installed add-on scenario and full
  performance matrix remain open.

## November 25 follow-up

The follow-up closes the scoped operations, administration tree and add-on
contract gaps above. The full snapshot remains available for legacy readers and
portable export and recovery. Live programmatic uploads retain their retry
identity for as long as the file exists.

On Windows with isolated MongoDB 8.0.29 and Chrome, the Files integration
verified concurrent GET and HEAD during replacement, invalid replacement,
unrelated public reads during 25 real uploads, cleanup after a definitive
rejection, reuse of a deleted address and recovery after projection failure.
The separate writer test ran four local processes after an interrupted writer
left an empty marker. The portable add-on integration installed a synthetic
runtime, streamed a logo through its SDK, rejected ordinary deletion, and
restored its reference to the corresponding file ID on the target site.
Partial Files dumps covered both Original and Responsive assets.
The focused run passed 41 integration tests and 16 application and adapter
tests. Build and TypeScript/Svelte validation passed.

Chrome opened the 100,000-row fixture in 1,254 ms after navigation began,
showing 25 entries without a full catalog request. The benchmark below
applies a real named output and checks batch metadata in MongoDB alongside
the individual path lookup. Times are observations on the test installation.

| Seeded files | Page ms | Search ms | Output lookup ms | Append ms | Page JSON bytes |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 14 | 28 | 1 | 45 | 12,662 |
| 10,000 | 12 | 195 | 2 | 37 | 12,691 |
| 50,000 | 25 | 336 | 1 | 45 | 12,691 |
| 100,000 | 36 | 647 | 2 | 43 | 12,693 |

The separate optional external SDK artifact remained unavailable. The installed
synthetic fixture exercises the CMS feature using the host registry. The
existing Bloglist packages need their own declarations to opt in to portable
reference mapping and deletion protection for their data.

- [Public file read contention](../../../defects/media/public-file-read-catalog-contention.md).
- [Abandoned site writer marker](../../../defects/media/abandoned-site-writer-marker.md).

## Additional audit follow-up

The installed add-on export/restore suite checked source-site restore after a
logo replacement, cross-site mapping to different image bytes at the same
address, and a force-deleted reference. The export reported the missing file.
Same-site restore kept its ID. Cross-site restore required explicit omission
before restoring the optional record. A second archive with a required
reference failed validation and preserved the already restored target data.

The real HTTP Files suite covered an admin card editing during twelve
programmatic uploads, stale same-file rejection, detected MIME rejection
before private storage, and successful unrestricted upload of the same bytes.
It also covered content failure after movement, conflicting occupation of the
old URL, publication failure after content updated, and retry after restarting
CMS with the file revision held constant. Separate tests verified public GET
and HEAD during replacement, GET/HEAD during bulk import and address reuse.

The isolated Windows/MongoDB/Chrome run passed 44 integration checks in
seven files. The optional external SDK artifact was unavailable. The package
installed by the add-on transfer suite supplied independent runtime coverage.
The focused application and adapter run passed 27 checks. The production
build, affected source lint and TypeScript/Svelte checks passed. Five
targeted scenarios passed again on the final build, including the omitted
field validation and a spy covering full-catalogue reads during normal edits.

Chrome navigated to a 100,000-record site in 1,199 ms and rendered the first
25 entries without a full snapshot. The 100,000-record projection benchmark
returned a page in 35 ms, looked up a named output in 1 ms and applied a
targeted append in 51 ms. Recursive substring search took 652 ms in the
synthetic fixture. These times are local observations.

- [Content-dependent add-on file restore](../../../defects/media/addon-files-checksum-restore.md).
- [Add-on export with dangling file IDs](../../../defects/media/addon-export-dangling-file.md).
- [Move link retry](../../../defects/media/file-move-reference-retry.md).
- [File card revision](../../../defects/media/file-card-catalog-revision.md).
- [Picker MIME validation](../../../defects/media/picker-mime-after-save.md).
