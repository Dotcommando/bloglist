# 0089. Process inventory and add-on-aware calibration

Status: Accepted. Date: 2026-11-16. Target: CMS 0.15.0.

## Decision

Show every live CMS coordinator, administration/background, site-serving and
temporary dump process in Settings / General, including PID and Starting, Ready
or Draining state. Observe actual children rather than infer process counts from
CPU capacity. The shared CMS CPU quota covers all these processes. Site process
allocations remain separate from CPU quotas; existing edit policy is preserved.
Service counts are fixed.
MongoDB is a separate resource. An add-on has no dedicated fork or CPU reservation.

Calibrate all sites together with their actual enabled add-ons. Retain per-site
add-on implementation versions, immutable runtime digests and configuration hashes
with each run. Secrets/configuration values are not exposed. Changed composition
requires a fresh calibration before applying its recommendation. Old snapshots
remain readable and explicitly lack the new composition evidence.

An immutable add-on manifest may declare bounded public read-only GET queries for
calibration. A declaration identifies the query and relative API path; only trusted
site/page placeholders and a frozen UTC window (`{now}`, `{in30Days}`) are
substituted. Profiles select up to eight queries per page scenario. The generator loads the published page, then its selected APIs in
order, without administrator credentials, redirects, writes or arbitrary hosts.
Only enabled same-site add-ons can supply steps. Whole-scenario and individual
step errors/latencies participate in acceptance. The publisher guarantees that
declared GET queries have no business side effects; the CMS validates transport
and scope, not arbitrary code semantics.

## Consequences

Events and Bloglist contribute to the workloads of their respective sites and
the shared database. The existing search still varies site process counts,
database/CMS CPU split and database pools. It does not allocate cores to add-ons.
Calibration excludes concurrent runtime updates through the existing resource
lease. Composition is checked at measurement and recommendation application.
Browser JavaScript is not executed: declared HTTP steps reproduce its API work.
Mutation scenarios require separate isolated fixtures and are outside this slice.
The external generator is reported separately from CMS process counts; CPU
contention on a single-core host remains a measurement limitation.

Existing add-on API namespaces do not need a literal add-on key in their URLs.
Preserve those URLs when adding calibration metadata to a Compatible update.
Root authentication, installation, update, health and broad site-management API
namespaces remain reserved. Temporary directory-lock errors during immutable
package staging use the existing bounded publication retry policy (five attempts,
25/50/100/200 ms waits), preserving candidate identity and final errors.

The external helper shares the application network namespace to reach the trusted
loopback listener; its PID namespace and cgroup remain separate. Wait for its
private socket in application startup rather than introduce a reverse Compose
dependency. Real quota, application and recovery evidence is recorded in the
[Docker audit](../audits/0.15.0-docker-addon-calibration.md).
