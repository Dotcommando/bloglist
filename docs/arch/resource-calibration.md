# Resource calibration

Settings / Calibration owns administrator-managed profiles and live measurement
runs. Settings / Main shows the ten most recent runs relevant to the current
site, including installation runs. Profile deletion retains historical snapshots.
All timestamps are UTC instants, displayed in the site's configured IANA zone.

## Scope and resource control

Every run covers all serving sites and searches process counts, pool sizes and
fractional local database CPU quotas under the profile's shared CPU budget.
Database CPU plus CMS CPU equals that budget for every measurement, including
the baseline. Managed Docker resource control and an external resource helper
are required. Native runs without enforceable quotas are rejected before load
generation. Every site needs positive traffic and must pass latency criteria.
CPU limits are installation-wide, never processor affinity or worker limits.
Legacy site-only results remain visible with a fixed-resource measurement label;
their declared CPU budgets were not enforced and they are not budget recommendations.

For example, a six-CPU installation can distribute four: 1 CPU to the database
and 3 to the CMS container, leaving two CPU equivalents unallocated. The generator
runs as a separate process under the private resource helper, outside the CMS
container quota. It still shares the host; no dedicated physical cores or clean
benchmark isolation are claimed. When all CPU capacity is distributed, the
generator competes with the tested workloads.

The helper connects only to an explicitly configured loopback HTTP listener.
Its default target is `http://127.0.0.1:3000`; override
`ZARYA_CALIBRATION_TARGET_ORIGIN` in the helper's startup environment for another
published local port. The helper must run outside the application container's
quota. A Docker helper may share the application's network namespace using
`network_mode: service:app` while retaining its own cgroup. This keeps the
fixed loopback target reachable without placing the generator in the CMS quota.
Start the application container with a bounded wait for the private helper socket,
then start the helper; do not create a circular Compose dependency. Public/private deployment ports and site serving authorities must already
be configured correctly. No arbitrary profile hostname becomes a connection
destination, and no SSH tunnel or CDN cache is measured.

Both one- and two-CPU systems search worker counts. Full Docker searches can
divide CPU in tenths between the database and CMS. A multi-CPU reference uses
1 database CPU and one process per participating site where the declared budget
permits it. For budgets of at most 1 CPU, the reference divides the budget in
tenths with both services positive; its actual allocation is retained. Integer
tenths preserve the whole budget, including odd fractional totals.

Availability is explained from observed prerequisites, with a recovery action:
missing supervisor/quota control, unreachable helper, unconfirmed quotas,
colocated generator, unavailable pool control, incomplete allocation, active dump
or workers that are not ready. Loading and failed status reads are distinct;
an HTTP failure does not imply that Docker is missing. Refresh clears stale
advice after the deployment or runtime condition has been repaired.

## Profiles and traffic

New profiles propose one home-page row with 100% traffic. Add rows with `+`.
Page references accept a registered absolute site URL, relative path or the
numeric page ID shown in administration. Positive rows must resolve to published
pages of their site, excluding administrative/API routes and redirects.

Shares are exact integer hundredths of a percent. The sum cannot exceed 100%;
the form immediately marks an excess and disables profile saving. Correcting it
clears the error. Blank shares save as zero, and zero rows remain editable. Zero
rows generate no requests and do not require a future page to be published.
Positive shares totaling less than 100% are normalized proportionally when run;
an entirely zero mix cannot run. The profile snapshot retains entered shares;
resolved targets retain effective normalized percentages. Input controls change
shares by one percentage point, preserving typed hundredths.

The default enabled latency criterion is p95 <= 600 ms. Average, median and p99
limits are optional. Every enabled criterion must pass for every participating
site. Measurements retain all four latency statistics, successful requests per
second, request/error counts and generator admission failures. Errors, empty
measurements or failed criteria cannot produce a recommendation.

Search ranges and timings are visible editable experiment parameters, not CMS
resource caps. The default search tries process counts 1/2/3/4, pools 1/5/10,
0.5-CPU database steps and generator HTTP concurrency 1/4/16/64. Each probe warms
for 5 seconds and measures for 10; final confirmation measures for 60 seconds
after warmup. The default overall budget is 900 seconds. Larger installations
initially leave two CPU equivalents outside the distributed budget where
possible; three-CPU installations distribute two. Adjust these choices to the
installation and workload.

The generator maintains a selected number of concurrent HTTP requests using
keep-alive, independently of the coordinator event loop. It measures complete
HTTP 200 responses without following redirects or sending administrator cookies.
This is a closed-loop capacity search, not an offered constant-arrival-rate test.
No scheduled iterations are dropped by this generator; errors are counted and
drain time is included in throughput. Generator saturation and outside traffic
can affect the result. The result is the best confirmed candidate within the
chosen ranges and time, not a proof of a global optimum or production SLA.

## Lifecycle, recovery and application

Starting a run returns promptly. Progress and measurements are polled separately;
the browser need not keep a mutation request open for the experiment's duration.
Candidate dimensions are interleaved across sites, pools and CPU, then repeated around the best
observed configuration. Every measurement retains requested and observed
resources, concurrency, profile/publication/CMS versions and its measurement time.

The supervisor journals the original allocation before any temporary change and
serializes calibration against resource writes, dumps and other calibrations.
Journal publication is exclusive and exposes only completely written bytes;
failed preparation removes its owned partial file without replacing an existing
recovery journal or changing resources. A retry needs no restart after that fault clears.
It waits for actual worker readiness, pool settings and managed CPU observations
before measuring. Serving continues through normal graceful resizing.

Completion, cancellation and failure restore the original allocation before the
result becomes applicable. A failed restoration remains visible, keeps the
private journal and blocks competing writes. Restarting the coordinator recovers
the journal before accepting public connections. Interrupted historical runs are
marked accordingly and do not acquire an applicable winner. A failed final
history write is retried when the administration reads results; it does not leave
a finished background task appearing to run indefinitely after the database
recovers. Shutdown cancels and reaps the generator before draining site workers.

Finishing a run saves evidence but does not persist the recommendation as the
installation's configuration. It fills Settings / General / Resources as unsaved
changes, preserving an already edited form. Press Save allocation to apply it.
Alternatively, the explicit Apply action in Settings / Main applies a retained
confirmed recommendation in one click. Installation results reject changed membership.
All writes use the current resource version. Review failures/actual state before
retrying an uncertain browser request.

Only active installation administrators can manage profiles, run/cancel
calibration or apply results. HTTP session and same-origin checks precede body
consumption. Histories and profiles are installation-owned global collections,
outside site-content dumps. Candidate measurements use separate documents to
avoid unbounded embedded run arrays. This capability creates no site dumps.

See [ADR 0085](../adr/0085-resource-calibration-profiles.md) and its
[budget/all-site amendment](../adr/0086-enforced-installation-calibration-budget.md).

## Add-on scenarios and process inventory (0.15.0)

Settings / General reports the actual coordinator, administration/background,
site-serving and temporary dump process PIDs and lifecycle states. Starting and
draining forks remain visible during replacement. All share the CMS CPU quota;
MongoDB is separate. Process counts are not dedicated cores. Service database
pool maxima apply separately to coordinator and administration processes.

Each page target may select up to eight public read-only GET queries declared by
an enabled add-on for that site. Runtime manifests use
`calibrationQueries: [{queryId, path}]`, at most 32 entries with 4096-character
relative API paths. The host substitutes `{siteId}`, `{pageId}`, `{now}` and
`{in30Days}`; UTC instants and resolved paths are frozen for the run. Unknown
placeholders, administrative routes, foreign authorities and redirects are not
accepted. The publisher guarantees read-only semantics. No administrator cookies
are sent by the generator. The profile retains query identities; resolved targets
retain exact paths and publication identities.

A selected visit loads its page followed by API steps in profile order. Aggregate
and per-site rates count completed visits, not the sum of HTTP requests. Separate
step metrics count HTTP requests and retain errors/p95/p99. Both whole-visit and
step criteria must pass; an unmeasured positive step cannot yield a recommendation.
`stepMetrics` keys encode the exact `[siteId, path]` pair as JSON. When API steps
are selected, every positive scenario's page and API paths need nonempty passing
observations; empty, incomplete or foreign-site maps cannot produce a winner.
Zero-share targets require no measurement.
Browser JavaScript and write operations are outside this mechanism.

Runs retain each site's enabled add-on versions, selected immutable digests and
configuration hashes, without private configuration values. Composition changes
fail an active measurement and prevent applying its old recommendation. Histories
without this evidence remain readable and require recalibration. The current
read-only catalog is installation-administrator-only.

See [ADR 0089](../adr/0089-process-inventory-and-addon-calibration.md). Browser
verification uses isolated Events/Bloglist runtimes, real MongoDB, serving forks,
HTTP requests and Chrome with a quota protocol double. A separate opt-in Docker
test uses the real resource helper and Engine CPU updates, checks application,
cancellation and forced-generator-failure recovery. See the
[executed Docker audit](../audits/0.15.0-docker-addon-calibration.md) for environment,
observations and reproduction. Short fixture timings are not production capacity
recommendations.

The production helper shares the application network namespace for the private
loopback generator target. It keeps a separate PID namespace and CPU accounting.
The application waits for the helper socket before starting HTTP; the helper's
Compose dependency on the application namespace must not be reversed.

## Result presentation

Each scenario request keeps its site/path heading and shows a compact two-row,
two-column table: requests/errors, then p95/p99 with separate ms units. Nested
metrics tables have no panel borders, header row or full-table cell padding.
By-site details reuse the same table for mean/median and p95/p99, retaining
throughput above it. Both disclosures use the shared inline text-action style.

In the profile/status column, Running uses the shared warning color; Cancelled,
Failed, Interrupted and RestorationRequired use danger; Completed uses success
(the shared green accent). Localized status text remains visible independently
of color. These are presentation changes; measurement and resource behavior is
unchanged.
