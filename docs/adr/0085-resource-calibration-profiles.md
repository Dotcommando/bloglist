# ADR 0085: Resource calibration profiles and retained measurements

Date: 2026-11-15

Status: Amended by [ADR 0086](0086-enforced-installation-calibration-budget.md).
The site-only/native-run decisions below describe the earlier implementation;
current calibration enforces the shared CPU budget and includes all sites.

## Decision

Add an administrator-owned resource calibrator with persistent profile CRUD and
run history. Implement the capability in the clean CMS first, then deliberately
update a separate local installation. This work authorizes neither a CMS release
nor creation of site dumps/backups.

Support two profile scopes:

- A site profile changes only that site's serving-process count. Shared database
  CPU, CMS CPU and the installation-wide site-process pool maximum stay fixed;
  other sites' process allocations stay unchanged.
- An installation profile describes the traffic of all serving sites and may
  optimize managed database CPU, the shared site-process pool maximum and each
  site's process count. With one serving site this covers the complete tuning
  problem without an additional traffic hierarchy in the editor.

Both one/two-CPU and larger installations may search process counts, database CPU
fractions and pool sizes when those parameters belong to the selected scope and
are controllable in the deployment. This supersedes the earlier fixed-process
calibration assumption for one/two CPUs; process counts are not physical-core
assignments. No derived memory/connection worker cap is introduced.

The profile declares the CPU budget available for distribution. When an
installation has six CPU equivalents and distributes four, the generator is
outside that four-CPU budget where the deployment can enforce the separation.
When all available CPU equivalents are distributed, the generator competes with
the tested installation. Record configured and actually observed budgets and
generator placement. Never present an unenforced budget as an observed quota.

Calibration runs against the serving installation. It does not enable maintenance
mode, remove normal external traffic or claim an isolated benchmark. External
traffic/resource contention is an accepted condition of these measurements.
Resolve configured page references to the selected site's published delivery
routes and target the CMS directly, rather than calibrating a CDN cache.

## Traffic profile and criteria

A new profile proposes the selected site's home page with 100% of generated
requests. A `+` action adds another page. Accept a registered absolute site URL,
a relative URL or the numeric page identity shown in administration. Numeric
identities remain scoped to their site; private internal identifiers are not
inferred from display numbers.

Traffic percentages have two decimal places of precision and are represented as
integer hundredths of a percent in business/storage contracts. Each row is
between 0 and 100%; their sum cannot exceed 100%. Reject over-allocation in both
the application and HTTP boundaries. In the editor the error appears and clears
reactively; profile save is disabled while the sum exceeds 100%.

An empty percentage is saved as zero. Retain zero-share rows in the profile for
future editing; they produce no test requests. Native input increment/decrement
controls change a share by one whole percentage point while typed input accepts
hundredths. Saving an incomplete traffic mix is distinct from executing it. At execution,
positive shares are normalized proportionally to a complete mix. Zero-share rows
remain in the snapshot and receive no requests; a wholly zero mix cannot run.
Persist both entered shares and the effective normalized mix.

Always retain average, median, p95 and p99 latency, successful HTTP throughput,
request/error counts and generator admission failures. All enabled latency
criteria must pass. Initially only p95 <= 600 ms is enabled; the operator may
change it and optionally enable average, median and p99 limits. Failed requests
must not make an otherwise failing candidate appear faster. Installation-wide
criteria apply per participating site as well as retaining aggregate metrics.

## Run lifecycle and results

Warm candidates before measurement. Search has explicit visible experiment
ranges and timing settings; those are not installation resource-admission caps.
For multi-CPU calibration retain a newly measured reference configuration with
one database CPU and one serving process per participating site, recording the
actual shared CMS budget and pool size. Keep the same declared experiment budget
when comparing candidates wherever that reference is feasible. At budgets of at
most one CPU the reference instead records a positive fractional split; native
site profiles retain the current shared database budget because it cannot be
controlled there.

Retain candidate results, the reference and the best successfully verified
configuration, each with its own UTC measurement timestamps. Each run retains
its profile snapshot, effective page mix, CMS/publication versions, configured
and observed resources and completion/failure/cancellation outcome. Profile edits
or deletion do not rewrite or erase earlier run evidence.

During the search, temporary candidates necessarily affect real runtime settings.
On completion restore the pre-run allocation before presenting the result as
ready for review. Save the recommendation in the database and populate the
resource form as unsaved changes. The resource form's Save action or the explicit Apply action in Settings / Main
applies the recommended configuration permanently. Cancellation/failure must restore
the previous configuration; uncertain restoration remains visible and recoverable
from a durable journal rather than being reported as success.

Authorize profile and run operations as installation administration. Authenticate
before parsing bodies or reserving calibration resources. Serialize calibration
against competing resource writes, dumps and other calibration runs. Run the
load generator independently of the measured coordinator's event loop; resource
sampling or generator lifecycle work must not block that event loop. Observe
all asynchronous failures and stop/reap generator processes on cancellation,
shutdown and parent loss.

## Verification

Cover exact percentage arithmetic, default home traffic, retained empty/zero
rows, live over-allocation errors, all reference forms and cross-site/foreign-URL
rejection. Cover authorized profile CRUD, immutable historical snapshots,
per-site criteria, scope preservation, baseline/winner selection, temporary
application/readiness, restoration, cancellation, rejected promises and restart
recovery. Exercise the real persistence/composition using guarded synthetic
databases; do not replace real resource or load adapters with production fakes.

The calibrator occupies Settings / Calibration. Settings / Main displays the ten
most recent relevant runs, with an explicit one-click Apply action for a retained
successful recommendation. Applying is an authorized resource write, not an
implicit consequence of a run finishing.

The first full resource-search adapter targets Docker installations with managed
resource control. Native installations support the site-process search with
shared CPU and pool settings fixed. Profiles/history remain available there;
unsupported full-resource runs fail explicitly rather than simulate CPU control.
