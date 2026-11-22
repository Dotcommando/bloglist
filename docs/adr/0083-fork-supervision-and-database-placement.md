# ADR 0083: Fork supervision and explicit database placement

Date: 2026-11-14

Status: Accepted by the owner for the unreleased 0.14.0 branch.

## Decision

One CMS coordinator owns every site-serving and dump-capture child, using
`child_process.fork` and private IPC. Docker/OS owns aggregate resource limits
and container restart; it does not manage the number of site workers. The CMS
coordinator owns readiness, site-aware routing, graceful draining, replacement,
capture cancellation and child reaping. Site workers never fork capture workers.

Database placement is explicit configuration, never inferred from the MongoDB
URI: `ManagedLocal`, `UnmanagedLocal` or `Remote`. ManagedLocal applies and verifies
separate database and CMS CPU quotas through the restricted deployment helper.
UnmanagedLocal uses an explicitly configured CMS CPU budget without controlling
the database. Remote uses the application machine's CPU budget without deducting
the remote database's CPU. Changing placement requires deployment configuration,
not a site-level form or request parameter.

CPU quotas describe processor time, not dedicated cores. Coordinator, site
workers, capture workers and their threads share the CMS budget. Do not deduct
a whole CPU for the coordinator. On a one-CPU managed installation, the database
and CMS share that CPU. The configured infrastructure reserve remains explicit.

Recommend `ceil(effectiveCmsCpuBudget)` serving workers. Additional sites start
with one worker. Allow positive integer process allocations above the CPU
recommendation with an advisory, without a confirmation gate. Remove the invented
aggregate memory/connection budgets and derived maximum-process admission rule.
Container memory limits and MongoDB pool settings remain separate deployment
parameters, not formulas that determine the allowed site-worker count. Actual
startup failure remains visible as a difference between desired and ready counts.

Preserve the owner's dump policy: borrow and drain one worker from a site with
at least two workers; otherwise use a child for any positive unallocated CMS CPU
remainder; otherwise capture inside the requesting site's worker. The coordinator
serializes admission against allocation changes and existing dump maintenance.
It restores borrowed serving capacity after capture has exited and cleaned up,
including failure/cancellation. Capture never borrows another site's worker.

The requesting site process retains its authenticated workflow and installation
write/maintenance lease. A delegated capture lease records both that operation
owner and the actual coordinator parent. The child verifies its actual parent,
job/site identity and unchanged operation ownership before and after capture.
Only validated metadata crosses IPC; archive payloads stay streamed in private
storage. Requester disconnect cancels/reaps its capture before releasing capacity;
coordinator shutdown aborts and awaits all capture work before closing site pools.

Separate-process capture keeps the site's event loop available; it does not
guarantee unaffected latency when the database, disk or CPU are saturated.
Database driver pools are per process and have additional monitoring connections.
Neither a pool's configured maximum nor an estimated process RAM cost is a
measurement of current resource consumption.

## Relationship to earlier decisions

This decision clarifies ADR 0082 and supersedes its aggregate memory/connection
admission policy and site-owned capture-child lifecycle. It preserves the dump
format, authorization, atomic archive completion, write gates, no-queue capture
contract and the three owner-approved execution modes. ADR 0075's bounded dump
execution and cleanup still apply; the serving requester and OS parent are now
separate identities during delegated capture.

## Verification

Cover allocations above the former three-worker/100-connection-derived limits,
all database placements, fractional CPU remainder and one-CPU sharing. Exercise
capture through real coordinator/site processes, verifying parent identity,
requester loss, cancellation, shutdown, failed replacement and cleanup. Keep
source distribution clean and perform local installation updates separately
from release publication. No release tag or publication is authorized here.
