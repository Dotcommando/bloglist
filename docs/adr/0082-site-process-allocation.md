# ADR 0082: Site process allocation and adaptive dump execution

Date: 2026-11-13

Status: Accepted for CMS 0.14.0; clarified by [ADR 0083](0083-fork-supervision-and-database-placement.md) on 2026-11-14. Release publication is separate.

## Context

The owner requests CMS-managed parallel serving without PM2, installation-wide
site CPU allocation in Settings / General, and dump execution that fits the
available CPU budget. The current implementation always creates dumps in a
leased child process under ADR 0075 and assumes one HTTP writer.

## Decision

Use CMS-owned supervision and site-aware request routing within the existing
single backend installation. Expose connected sites, effective CPU capacity and
per-site process budgets to the authorized installation administrator. Distinguish
logical CPU budgets from exclusive hardware affinity.

Visualize managed resources in a Docker frame containing the DB engine/version
and CPU quota, followed by a nested CMS processes (fork) frame with site allocations.
Separate fractional container CPU ceilings, integer process counts and measured
usage. A 2.6 CPU container ceiling neither creates three CPUs nor enforces
per-site 1.0/1.0/0.6 CPU shares. The owner explicitly excludes fractional per-site
CPU quotas and their cgroup enforcement from 0.14.0.

The owner accepted `ceil(effectiveCmsCpuBudget)` as the recommended total serving
worker count, with no hard cap based on it. Prefer fewer sites than available CPU
capacity, but allow additional sites/workers with a non-blocking explanation and
no override confirmation. A lower recommendation alone does not stop existing
sites/workers. Keep CPU-quota validation. ADR 0083 removes the invented aggregate memory/connection
process cap and makes database placement and direct coordinator ownership explicit.

Include the logical CPU count and one live load graph per logical CPU from
trusted host/VM counter samples, supplied every one second from successful admin
login through an authenticated read-only WebSocket. Collect only while authorized
admin subscribers are connected, across admin sections; stop after the last
subscriber leaves. Store no server-side metric history, replay buffer or metric
logs. Keep only the prior counters required for interval calculation and bounded
transport state; chart points exist only in browser memory. Reconnect without
replay, enforce session/Origin checks and bound slow-client buffering. This
telemetry transport does not change REST/JSON site/business operations. Distinguish
measured host/VM usage from container quotas and site process counts. Do not
claim per-site attribution or physical-core mapping from these counters. Missing
or delayed samples must remain visibly unavailable, including during blocking
in-process dumps. No dedicated monitoring stack is required by this request.

Include the owner's local two-site load verification after implementation. A
second synthetic site belongs to the separate local site installation or an
isolated copy. Registered localhost authorities with different ports can reach
the same cluster through explicit port publishing/proxying without hosts-file
edits. Correlate real one-second core graphs with per-worker request/CPU metrics;
connection scheduling and OS scheduling do not promise perfectly equal load.
Observed verification belongs in the [focused audit](../audits/0.14.0-site-process-allocation.md).

The principal load-test acceptance is process-budget enforcement and event-loop
freeze isolation: a blocked site A worker must not block site B's separate workers,
receive B's worker allocation or trigger unconfigured extra A workers. Verify
neighbor latency/errors under controlled shared-resource headroom, then report
saturation separately. Worker counts do not guarantee exclusive per-site CPU,
memory or database capacity; existing installation-wide dump write gates remain
intentional and are not a cross-site event-loop freeze.

The owner's final clarification makes the site's process count the first dump
decision. With at least two serving processes, always drain/stop one target-site
process, run the dump child in its place and then start a replacement. With one
serving process, any positive unallocated CPU remainder, even 0.1 CPU, permits a
child; no positive remainder means capture inside that site's serving process,
accepting event-loop stalls. Do not round capacity to integer free slots.
Restore borrowed capacity after failure as well as success.

Default to one CPU of database budget and one serving process per site, leaving
other capacity unallocated. Additional sites receive one process even beyond
the recommendation. On a single CPU the database and CMS share it; one-site
installations with one or two CPUs have no editable distribution. Explain the
selected site's actual dump behavior below the allocation form. The detailed
scope records the approved one/two/three/six-CPU examples and telemetry limits.

The [0.14.0 scope and acceptance criteria](../arch/0.14.0-site-process-allocation.md)
define these branches and recovery requirements. Cross-process write admission, maintenance, publication,
cache invalidation and background-work ownership are prerequisites for enabling
multiple serving processes.

The owner's clarification includes visual MongoDB CPU allocation in Settings /
General. The backend must apply and verify Docker limits for the managed database
container, including fractional CPU quotas, and retain configuration across
container recreation. Keep process counts separate from CPU-time quotas.
Use an explicit deployment control port; the integration is a narrowly
authorized local helper rather than unrestricted Docker access in HTTP-serving
processes. The private helper applies, persists and verifies registered quotas;
uncertain outcomes remain visible as apply errors with observed limits.
Unmanaged deployments must report the control as unavailable. Infrastructure
reservations must not be advertised as free CMS slots, and quotas alone must not
be described as reservations or exclusive physical cores.

Keep Docker as the production resource boundary, with an aggregate CMS
budget and a separate MongoDB budget; site process counts are managed inside the
CMS container. Include reconciliation of both Compose definitions in 0.14.0:
CMS/executor image labels follow the root release version, and both environments
use the same latest stable MongoDB selected at release preparation, pinned by
plain `X.Y.Z` image tag and digest after upgrade and compatibility verification.
CMS/executor image tags also use plain `X.Y.Z`, without `-official`, `-rc` or other
suffixes; Git release tags use `vX.Y.Z`, as required by the release workflow.
The durable numbering and publication rules are recorded in root `AGENTS.md`.
Preserve environment-specific security/storage settings and prevent version
drift through focused release checks. No running production update is implied.

## Relationship to existing contracts

This decision replaces ADR 0075's unconditional child-process
creation rule and its single-HTTP-writer restriction with the verified coordinated
model. It preserves archive format, authorization, snapshot consistency,
maintenance semantics, atomic completion and lost-response reconciliation.
Child-process safeguards still apply whenever a dump child is used; in-process
execution requires its own resource/cancellation semantics.

The current [dump contract](../arch/site-dumps.md) describes coordinated admission
and adaptive capture. External/local writers still require quiescence.

## Consequences

Process count increases memory and database connection use. A process budget
alone provides no exclusive physical-core guarantee. The no-capacity fallback
can block the serving event loop. Coordinated recovery and visible actual
allocation are necessary to avoid oversubscription and false success reporting.
