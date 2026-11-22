# ADR 0086: Enforced CPU budgets across all calibration sites

Date: 2026-11-15

Status: Accepted by the owner for unreleased 0.14.0.

## Decision

This supersedes ADR 0085's process-only site calibration mode. Entering a CPU
budget always means a real shared database-plus-CMS quota, not descriptive
profile metadata. For every reference, probe and confirmation, the requested
database CPU plus CMS CPU equals the declared budget. The generator runs in
a separate helper container/cgroup, competing for host capacity when no spare
capacity remains. Process counts do not represent dedicated physical cores.

Profiles cover every serving site because database CPU and the connection pool
setting are shared. The editor always shows one compact, themed background
section per site. New profiles start with each site's home page and divide the
initial traffic equally, using exact hundredths. Each site must have positive
traffic to start. Blank/zero rows, proportional normalization and the overall
100% maximum retain ADR 0085's semantics.

The search varies fractional database CPU, the complementary CMS CPU quota,
the shared per-process pool maximum and every site's serving-process count.
Interleave candidate dimensions so a bounded run does not exhaust its time
on the first site's process counts. Keep baseline and candidate CPU arithmetic
in integer tenths before conversion to quota values.

Before generating traffic, verify observed Docker quotas, ready process counts
and applied pools. Any mismatch fails the run and triggers original-resource
restoration; it cannot produce a recommendation. Native installations without
managed CPU control cannot start this calibrator. Profile/history editing remains
available, with a clear Docker prerequisite.

Retain old site profiles and run snapshots without rewriting historical evidence.
Opening an old profile prepares an explicit conversion to all sites; missing
sites start with zero traffic and require editing/saving before running. Reject
legacy site-only run requests at the application boundary. Mark their historical
results as measurements at fixed resources, not budget-constrained calibration.

No change authorizes release publication, dumps, backups or resetting site data.

## Verification

Regress reference and every candidate under 1, 2 and 3 CPU, odd fractional
budgets, observation mismatch before load generation, unsupported native runs,
all-site traffic, numeric page resolution, restoration and themed responsive
site groups. Protocol doubles test resource orchestration separately from a
real Docker check of container quotas and cgroup limits.
