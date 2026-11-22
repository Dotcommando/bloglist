# ADR 0084: Live configuration of site database connection pools

Date: 2026-11-14

Status: Accepted scope for the unreleased 0.14.0 branch.

## Decision

Expose one positive integer maximum database-pool size per site-serving process
in Settings / General / Resources. This setting is independent of CPU allocation,
including installations with one or two CPUs where process allocation is fixed.
It neither limits site-worker counts nor represents a global connection budget.

Persist the requested size with the versioned private process allocation. Older
allocation files inherit their initial size from `ZARYA_MONGO_MAX_POOL_SIZE`, whose
default remains 5. The environment setting also configures the coordinator's
separate service pool at startup. Show that service-pool size explicitly. The
administrative control added here changes site-serving pools; it does not pretend
to reconfigure the coordinator, deployment executor or bounded capture pool.

Use the driver's supported startup configuration rather than mutate driver pool
internals. The coordinator starts one replacement site process, waits for readiness
and the reported actual pool maximum, then drains its predecessor. Repeat for the
remaining processes without restarting the coordinator or requiring an operator
restart. This temporarily needs one extra process. A replacement-start failure
keeps its predecessor serving. Retrying reconciles any mixed configuration.

Expose requested and uniformly applied sizes separately. A partial change cannot
be acknowledged as fully applied. Invalid values, stale configuration versions,
concurrent allocation changes and active capture are rejected through the existing
resource-operation boundary. Authentication and trusted-origin checks precede
request-body admission. Existing clients may omit the new optional request field.

The maximum applies to each server pool within a site's process, not the sum of
all replica-set members. Pools grow on demand; their maximum is not preallocated RAM or an immediate number
of open sockets. Driver monitoring connections are separate. No memory-derived or
aggregate-connection-derived worker cap is introduced. A CPU count alone cannot
determine the best pool maximum: recommendations require an identified workload,
process count, database placement and reproducible measurements.

## Verification

Cover positive-integer validation, unchanged fixed allocations on one/two CPUs,
legacy allocation loading, persistence, partial application/retry, failed process
startup and mismatched actual readiness. Browser integration uses a separate
synthetic database and real forked site processes. Benchmark reports distinguish
driver checkout waits, successful HTTP throughput and response latency, and state
whether traffic bypassed a CDN. This workflow does not require data dumps/backups.
