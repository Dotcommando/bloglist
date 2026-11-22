# Page resolution statistics

CMS 0.10.1 records public document preparation through the private diagnostics
capability. See ADR 0062 and the owner-approved extension in ADR 0066.

## What the durations mean

`durationMs` measures monotonic elapsed time from entry to the public HTTP
middleware until its first document write/end. It includes trusted site/route selection,
published data access and response preparation. A stored document includes the
work needed before its first byte can be handed to HTTP. A Request document
includes its Snippets, HTML/JSON-LD completion and negotiated Markdown conversion.

`completionMs` ends at HTTP finish, or close for an interrupted response. Finish
means Node handed the response to its transport; it does not prove the browser
received it. Neither duration is browser-observed TTFB. HEAD and conditional
responses can prepare different amounts of work and retain their own metadata.

The observer keeps bounded intervals in memory. Validation, queuing,
serialization and MongoDB writes start in a deferred callback only after the
response finishes/closes and the handler settles. Delayed Worker cleanup has a
separate interval and a bounded observation window of two seconds. It does not
increase the recorded response-preparation duration. Instrumentation itself has
small in-process costs; the deferred load experiment will quantify that overhead.

Assets, sitemap, API/admin requests and unregistered hosts are excluded. Known
site document failures, redirects and disconnections are retained. No query
values, headers, credentials, Snippet input/output, source or raw exceptions are
stored. Statistics are not available through a public diagnostics endpoint.

## Settings and queries

Settings / Page statistics uses the shared administration table and an optional
Bits UI date-range picker. It defaults to successful GETs today in the site's
configured IANA time zone, all CMS versions, delivery types and representations.
Choose seven days, thirty days or an inclusive custom calendar range. Additional
filters distinguish static/dynamic/unresolved/redirect delivery, HTML/Markdown,
GET/HEAD and outcomes. The range includes the current day; it is not a rolling
168/720-hour window. The server supplies today's date to the browser.

The authenticated endpoint is:

`GET /api/admin/sites/:siteId/page-resolutions`

Optional query fields are `from`, `to` (both YYYY-MM-DD), `cmsVersion`, `delivery`,
`representation`, `method` and `outcome`. The last four accept `all` to remove a
filter. Omitted method/outcome mean GET/Success. Unknown or duplicate parameters,
malformed/reversed dates and unsupported enum/version values return validation
errors. The authorized site-reading port is checked before the statistics store.

Results contain the complete path table, available CMS versions for the retained
date range, effective calendar range/time zone, retention cutoff and private
process-local loss counters. There is no silent result-count limit. Paths are
sorted by calls descending with a path tie-breaker. Version discovery remains
independent of the selected version so the filter can be changed back.

Average and median are exact for the selected requests. An even median is the
mean of the central pair. p95/p99 use nearest rank: sorted element
`ceil(percentile * count)`. MongoDB uses disk-backed window aggregation, rather
than collecting all durations into a BSON array or application memory. Read
queries have a ten-second execution budget. Results describe the selected
retained records; concurrent writes may appear in the next refresh.

## Persistence and operator controls

Migration 0007 adds `page_resolutions`, its BSON validator and these indexes:

| Index | Purpose |
| --- | --- |
| `(siteId, startedAt)` | Mixed-version site/date selection |
| `(siteId, cmsVersion, startedAt)` | Site/version/date selection |
| `expiresAt`, TTL 0 | Delete each record 90 days after its UTC start instant |

Queries also exclude records older than 90 days because MongoDB TTL deletion is
eventual. Optional delivery/format/method/outcome predicates use the selected
date range, rather than introducing an index for every combination. The isolated
integration test verifies keys, TTL options, validators, exact percentiles and
execution statistics for the version/time index.

Set `ZARYA_PAGE_DIAGNOSTICS=true` or `false` before startup. True is the default;
other strings fail validation. Settings remain immutable for the process.
Disabling recording leaves existing statistics readable. The current CMS version
is read from the root package at composition; no second version constant exists.

This is best-effort telemetry with no retries or extra service. One write runs
at a time, at most 4096 records are admitted, and each request retains at most
256 nested stages. Overflow and failed writes are counted by site. The table
warns when the current process reports losses. These counters reset on restart;
they cannot prove completeness across crashes. Shutdown drains admitted work for
at most two seconds. The capability is not a durable audit journal.

## Detailed stage evidence

Each retained record contains `stages`: numeric id/parentId, closed stage name,
offset and inclusive duration in milliseconds, and a sanitized outcome. Physical
Snippet executions and deduplication waits use distinct stage names. Optional
fallback is an explicit outcome. Failed, aborted and unfinished intervals must
not appear as zero-duration success. Missing stages were not reached. Inclusive
parents/children and concurrent work must not be summed as total latency.

Operators can group these private records by stage and outcome to derive stage
p50/p95 and counts. For example, in an authorized MongoDB diagnostic session:

```javascript
db.page_resolutions.aggregate([
  { $match: { siteId: "SITE_ID", cmsVersion: "0.10.1" } },
  { $unwind: "$stages" },
  { $group: {
    _id: { stage: "$stages.stage", outcome: "$stages.outcome" },
    count: { $sum: 1 },
    duration: { $percentile: {
      input: "$stages.durationMs", p: [0.5, 0.95], method: "approximate"
    } }
  } }
], { allowDiskUse: true, maxTimeMS: 10000 });
```

This example uses MongoDB's approximate stage percentiles; the page table's
median/p95/p99 use the exact window algorithm above. Restrict diagnostic exports
to authorized operators; they contain private site paths. Check droppedStages
and process loss counters before interpreting coverage.

The owner explicitly deferred ADR 0062's full cold/warm concurrency and memory
baseline to a separate performance task before 0.11.0. No speedup or supported
concurrency level is asserted by these functional checks.
