# ADR 0074: Bounded document refresh before expiry

Date: 2026-11-10

Status: Accepted through the owner's implementation request and TTL clarification.

## Decision

Existing retained SharedPublic representations with TTL greater than 20 seconds
schedule regeneration 20 seconds before their monotonic expiry. TTLs of 20
seconds or less retain blocking fills only; the page editor warns about this.
Refresh never extends an old deadline on failure, fallback, timeout or abort.
An expired visitor joins an admitted refresh for the same key or uses the normal
blocking fill/error behavior. There is no stale-on-error or stale-while-revalidate.

The application owns eligibility, live activation checks and result acceptance.
The cache owns bounded refresh scheduling and coalescing with foreground fills.
Schedules retain only public normalized request identities, not full plans.
Reload and verify the immutable plan at dispatch; require the captured content
fingerprint and selected release before rendering and before accepting a result.
Maintenance generation changes and shutdown fence old work and cancel refreshes.

IRequestDocumentRefreshPort accepts a verified plan and normalized public values
and returns the same complete document as ordinary rendering. A Worker adapter
executes the shared application document-rendering service in a dedicated bounded
thread pool. Native and edited Snippet reads bridge through the existing loader
port, preserving live CMS/add-on access and query-only cache semantics. No worker
types or message fields enter application/domain/port contracts. Background
Snippet jobs do not consume the foreground pool reservation. No new database
connections, nested background pools or alternate rendering implementation.

Initial adapter bounds are one active Worker, 16 queued jobs, 1000 ms queue wait,
10 seconds total execution budget, 256 MiB old-generation/32 MiB young-generation/
4 MiB stack per Worker, 8 MiB per job/bridge response and 2048 bridge calls per
job. Schedules are bounded to 256 entries and 8 MiB of accounted public input.
Excess background work is refused and counted without moving CPU work onto HTTP.
Foreground fills retain their existing independent admission guarantees.

Observe every job, bridge, timer callback and cleanup rejection at creation.
Timeout/cancellation discards the Worker and holds physical admission until its
termination and bridge work settle. Do not replay failed jobs. A failed refresh
is attempted again only after a later successful ordinary fill. Successful
refreshes schedule the next cycle while the entry remains retained. Eviction,
activation changes and maintenance prevent obsolete results from repopulating
current state. Coordination remains local to one serving process; independent
processes do not share cache entries or refresh admission.
