# ADR 0066: Page resolution statistics after response completion

Date: 2026-11-07

Status: Accepted through the owner's 0.10.1 request and follow-up answers.

## Decision

Extend ADR 0062 with private MongoDB-backed statistics and an authenticated,
site-scoped Settings tab. The owner's explicit request supersedes that ADR's
exclusion of a collection and administration dashboard. Keep ADR 0063's runtime
optimizations in 0.11.0. The owner deferred the separate full cold/warm load and
memory baseline to a performance task before 0.11.0.

Measure every resolved public document request using a monotonic clock, from
entry to the first response write/end (headers/body ready). Capture a separate
completion/disconnect interval. Node's finish event means the response has been
handed to the transport, not that the remote browser received it. Neither value
is browser TTFB. Do not include persistence, serialization or queue processing in
the measured intervals. Start those activities in a deferred callback after
finish, or close for an aborted response. Never await diagnostics to send a page.
Exclude assets, sitemap, administration, API requests and unknown sites. Preserve
GET/HEAD, conditional responses, redirects, failures, cancellation and streaming.

Record trusted site identity, path without domain/query/fragment, CMS version
from the root package, request method, HTML/Markdown representation, delivery
kind, status, sanitized outcome, UTC start instant and durations. Retain nested
stage observations from ADR 0062 without payloads, source, credentials or raw
exceptions. Skipped stages are absent; inclusive intervals must not be summed.

RecordPageResolution accepts only a trusted internal delivery observation and
returns void after validating and storing it through an outbound store port.
It has no public mutation endpoint. GetPageResolutionStatistics accepts siteId,
inclusive calendar from/to dates, optional CMS version, delivery, representation,
method and outcome filters. It first obtains the authorized site's time zone
through an explicit site-reading port, then translates dates into a half-open
UTC interval. Omitted dates mean today. Partial, invalid and reversed ranges
fail validation. Missing sites and denied access preserve existing errors.

The statistics store returns complete grouped path results sorted by call count
descending, then path ascending, and the available CMS versions. The default
selection is successful GET documents, all delivery kinds/representations and
CMS versions. HEAD, redirects, errors and aborts remain selectable. The table
shows path, calls, average, median, p95 and p99 in milliseconds, with localized
number formatting. Median is the mean of the two central observations for an
even count; p95/p99 use nearest rank. Do not silently sample or truncate rows.
Small sample counts remain visible so percentiles can be interpreted correctly.

Store independent records in page_resolutions for 90 days. Use a TTL index on
expiresAt, plus site/time and site/version/time indexes; optional filters are
applied after these bounded range scans. TTL deletion is eventual, so queries
also exclude expired records. Aggregation runs in MongoDB with disk-backed
window sorting, without pushing every latency into one BSON array or loading
all raw records into the application.

Use a bounded process-local pending sink: at most 4096 pending records, 256
stages per request and one active write. Overflow, failed writes and dropped
stages are explicit diagnostic counters; do not retry or fail public delivery.
This is best-effort telemetry, not an audit journal. Shutdown drains admitted
work with a finite timeout. Process-local loss counters reset on restart.

Dates use the site's configured IANA zone. Today, seven days and thirty days
include the current calendar day; custom endpoints are inclusive dates. Instants
stay UTC; datepicker values remain dates. Use Bits UI's Svelte range calendar.

Update the independent local installation as an explicit engine-file transfer;
preserve site content, configuration, packages, registrations and existing data.
Apply additive migrations and build the administration, leaving its server stopped.

## Verification

Use deterministic clocks and outbound fakes for recording and authorized reads;
test date boundaries/DST, filters, percentiles, scope and failures. Verify HTTP
finish/close ordering, static/dynamic delivery and a failing/slow sink through
isolated servers. Verify MongoDB validators, TTL and query indexes in an isolated
database. Browser checks use the built admin and synthetic API responses.
