# Database-pool measurements for small local-database installations

Date: 2026-11-14. Unreleased CMS 0.14.0.

## Recommendation

Start with a maximum of **2 connections per site-process pool** for the measured
one/two-CPU profiles below. Keep the separately configured coordinator pool at 5.
This is a measured starting recommendation for this workload, not a CPU formula,
an automatic tuning rule or a global connection/process admission limit.

| Available CPU budget | Site processes | Site pool maximum | Coordinator pool maximum |
| --- | --- | --- | --- |
| 1 CPU shared by CMS and local MongoDB | 1 | 2 | 5 |
| 2 CPUs: 1 CPU quota for CMS, 1 for local MongoDB | 1 | 2 | 5 |

The existing initial default remains 5 for installations that have not been tuned.
Use Settings / General / Resources to change site pools; the coordinator's startup
setting is `ZARYA_MONGO_MAX_POOL_SIZE`. Saved site settings take precedence over
that initial default. See [ADR 0084](../adr/0084-live-site-database-pools.md).

A maximum applies to each server pool in each process. Monitoring connections
are additional, and pools open connections on demand. It is not an immediate
allocation of that many sockets or a whole-installation connection limit.
See the [MongoDB driver pool documentation](https://www.mongodb.com/docs/drivers/node/current/connect/connection-options/connection-pools/).

## Environment and method

- ARM64 Linux host, 2 available CPUs, approximately 3.7 GiB RAM; Docker cgroup v2.
- Node.js 26.7.0, npm 11.19.0, MongoDB 9.0.8 with the repository's pinned image
  digest. MongoDB WiredTiger cache was 0.25 GiB in this isolated experiment.
- An independent installation, network and fresh replica-set database on the test
  host. The existing site's database and containers were not changed. No data
  dumps or backups were created.
- One coordinator and one site worker. Two synthetic published `ZaryaBasic`
  Request pages with no loaders. Actual driver checkouts confirmed database work.
- For the one-CPU profile, both test containers used CPU affinity `0`, sharing
  that CPU. For two CPUs, both used affinity `0,1` with separate 1-CPU CMS and
  MongoDB quotas. The original host services remained running; their background
  load was not controlled.
- k6 2.4.0 ran outside the server, through a loopback-only SSH tunnel to the test
  origin, preserving its registered Host. Traffic bypassed the CDN. Each request
  fetched HTML only: 60% home, 40% the second page, without pauses or retries.
- Screening: 50 VUs for 30 seconds per pool size after 5 seconds of 10-VU warmup.
  Sizes 1, 2, 3, 5 and 10 were tested in a nonascending order for both CPU profiles.
- Confirmation: 50 VUs for 60 seconds after 15 seconds of 50-VU warmup. Candidate
  order was reversed relative to screening within each CPU profile.
- Only the isolated CMS was restarted between configurations. Live administrative
  application was verified separately by real-composition browser integration on
  both CPU profiles, including actual pool readiness and worker PID replacement.
- HTTP latency includes the SSH/network path. CPU is the cgroup usage delta over
  the sampling window. Checkout waits come from driver CMAP events; they include
  scheduling and pool admission, not just database execution time.

## Results

Screening results:

| CPU budget | Site pool | Successful requests/s | HTTP p95, ms | Failed requests |
| --- | --- | --- | --- | --- |
| 2 | 5 | 134.81 | 563.32 | 0 |
| 2 | 1 | 129.04 | 584.58 | 0 |
| 2 | 10 | 129.72 | 600.29 | 0 |
| 2 | 2 | 134.08 | 555.84 | 0 |
| 2 | 3 | 130.25 | 569.09 | 0 |
| 1 | 3 | 102.79 | 714.43 | 0 |
| 1 | 10 | 115.11 | 606.59 | 0 |
| 1 | 1 | 118.08 | 596.91 | 0 |
| 1 | 5 | 117.06 | 600.78 | 0 |
| 1 | 2 | 122.82 | 564.05 | 0 |

Minute-long confirmation:

| CPU budget | Site pool | Successful requests/s | HTTP p95, ms | Mean site checkout wait, ms | Peak checked-out site connections |
| --- | --- | --- | --- | --- | --- |
| 1 | 2 | 124.91 | 564.23 | 32.63 | 2 |
| 1 | 1 | 123.81 | 571.16 | 37.36 | 1 |
| 2 | 2 | 133.60 | 580.41 | 27.91 | 2 |
| 2 | 5 | 127.77 | 609.12 | 21.12 | 5 |

All **68,028 measured requests across 14 runs** returned HTTP 200. There were no
driver checkout failures. Warmup and the initial smoke probe are excluded from
that total. The coordinator used at most its configured 5 pool connections.

With pool size 2, the shared one-CPU profile averaged approximately 80% CPU for
the CMS and 18% for MongoDB. In the two-CPU profile, CMS averaged approximately
96% of one CPU and MongoDB 24%. CMS CPU was the principal observed constraint.

## Interpretation and limits

Pool 2 retained the observed throughput of larger pools while using fewer data
connections. Pool 1 also worked, and its minute-long one-CPU throughput differed
by less than 1%; these runs do not establish a statistically significant speedup
over 1. Two connections are the practical recommendation because both were used
and the setting leaves room for concurrent operations without growing to 5/10.

Increasing the pool can reduce its own checkout wait while failing to improve
overall response time: the CMS still shares a fixed CPU quota across coordinator
and serving work. The results do not justify a memory cost per connection or any
connection-derived maximum site-worker count.

These are small read-only synthetic pages on one host, with a fixed-VU workload
and network overhead. The database/cache warmed and grew across runs; host
background activity and short-run variation remain limitations. Memory samples
were not used to infer per-connection cost. Remote databases, slower queries,
multiple workers, add-ons and write-heavy workloads require their own checks.
These measurements are HTTP/driver results, not browser Core Web Vitals or a
performance SLA for a different site.
