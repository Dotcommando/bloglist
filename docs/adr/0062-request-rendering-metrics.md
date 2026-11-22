# ADR 0062: Request rendering stage metrics in CMS 0.10.1

Date: 2026-11-06

Status: Timing diagnostics implemented for CMS 0.10.1 under ADR 0066.
The owner explicitly deferred the full performance baseline on 2026-11-07.

## Context

The current CMS version is 0.10.0. Public Request delivery selects an activated
release, loads its private plan, normalizes inputs, executes Snippets, composes
HTML and completes the document with prebuilt assets. Markdown negotiation adds
a conversion step. There is no measured baseline supporting a numerical rating
of dynamic-runtime efficiency or a promised speedup.

Inspection confirms that ScriptSnippetAdapter creates and terminates a Worker
for each read. ModxCompositionAdapter tokenizes frozen source during composition
and awaits declarations sequentially. RenderDataService already deduplicates
matching executions within one render. These are candidates for investigation,
not measured bottlenecks. See [ADR 0063](0063-request-runtime-optimizations.md)
for the separately scheduled 0.11.0 optimizations.

## Decision

CMS 0.10.1 introduces server-side timing diagnostics for Request documents before
changing execution, caching or publication formats. Preserve public status codes,
error sanitization, cancellation, GET/HEAD behavior, no-store and frozen Build
values. Instrumentation must not execute additional Snippets or CMS operations.

Measure elapsed durations with a monotonic clock, in milliseconds. Diagnostic
record timestamps, when present, are UTC instants. The following boundaries must
be distinguishable rather than reported only as one render duration:

| Boundary | Required observations |
| --- | --- |
| HTTP document handling | Trusted site resolution, route/release selection, total time until response headers can be sent, and response completion or disconnect |
| Published plan | Activation verification, exact selected plan read/validation, request input normalization |
| Runtime | Total runtime interval, template tokenization/parameter-expression parsing, dependency/input preparation, Snippet waits, markup composition and output validation |
| Snippet execution | One physical execution versus a deduplication wait, input/output validation, Worker startup until ready, script execution, CMS bridge calls and result transfer/decoding |
| Document completion | Prebuilt asset/CSS/JS insertion, JSON-LD generation/injection where used, inline-style hash preparation and optional Markdown conversion |
| Failure/termination | Failed stage, sanitized outcome, timeout, cancellation and cleanup/Worker termination |

JSON-LD and HTML using the same prepared Snippet values must not count as two
physical executions. A declared optional fallback must be distinguishable from
ordinary success. Include successful, failed and aborted executions; a failure
before a stage starts marks that stage as skipped, not as a zero-duration success.
The Worker ready signal is instrumentation only and does not introduce reuse.
Record teardown separately if it finishes after the response becomes ready.

Use nested intervals or equivalent parent/child correlation. Wall-clock time,
queue/wait time and overlapping child work are distinct; do not sum inclusive
stage durations to claim total latency. In 0.11.0 extend these same observations
with pool queue wait, pool occupancy/rejection, parallel scheduling and cache
lookup/hit/miss/expiry/eviction rather than replacing the baseline definitions.

### Diagnostics boundary and privacy

Application orchestration reports semantic stages through a small framework-free
outbound observation contract. Adapters report technical sub-stages; composition
binds a bounded diagnostic sink and validates configuration once at bootstrap.
Do not import a logging, metrics or tracing SDK into domain/app/ports. A broken
or overloaded diagnostic sink cannot fail, delay without bound or retry a render.
Do not introduce a monitoring service, database collection or public diagnostics
endpoint as a prerequisite.

Provide documented, operator-controlled structured diagnostics with correlation
and a reproducible way to derive stage p50/p95 and outcome counts. Record stage,
duration and a bounded outcome vocabulary; retain trusted site/release/plan and
Snippet identities only as private diagnostic context. Keep aggregate metric
labels bounded; page IDs, paths and arbitrary Snippet names are not unrestricted
metric labels. State sampling and dropped-record behavior so percentiles and
failure counts are not represented as complete when they are sampled.

Never record query values, Snippet arguments/results, CMS payloads, cookies,
credentials, raw source, private filesystem paths or raw exceptions. Do not put
private diagnostics into HTML, response headers or public release artifacts.
Browser telemetry and a new administration dashboard are outside this decision.

### Baseline and interpretation

Use deterministic synthetic Request pages in an isolated installation: no edited
Snippet, one trivial edited Snippet, several independent reads, a dependency
chain, repeated identical calls, CMS-query reads and a controlled slow/failing
provider. Include HTML/Markdown and GET/HEAD where their paths differ. Do not
install business add-ons or use an owner's live site as a benchmark fixture.

Compare cold and warm runs at 1, 10, 50 and 100 concurrent document requests,
with explicit warmup, duration/request count, toolchain, hardware, process limits
and fixture details. Record client-observed p50/p95 TTFB, server stage p50/p95,
throughput, failures/timeouts/rejections, process RSS/heap, Worker count and event
loop delay. Count rejected and failed requests; do not derive success from latency
percentiles alone. Separate load generation from the measured server where needed.

Server time until headers are ready is not client-observed TTFB: proxy, network
and transport effects must remain distinguishable. Compare diagnostics enabled
and disabled to quantify their overhead. No fixed speedup or supported concurrency
level is asserted by accepting this ADR. Benchmark results belong in technical
performance evidence, with no private installation data.

## Acceptance and delivery

- Deterministic clock/sink doubles verify stage nesting, physical execution versus
  deduplication, optional fallback, validation failure, timeout, abort and cleanup.
- Adapter regressions cover Worker startup/result/error/exit observations and sink
  failure without changing the existing sanitized rendering outcome.
- Focused composition and isolated HTTP integration checks verify the actual
  Request path, JSON-LD shared values, representation negotiation and no-store.
- Document how an operator enables and consumes diagnostics, their units, privacy,
  sampling and overhead; produce the synthetic baseline before comparing 0.11.0.

Agree the concrete observation/configuration contracts before implementation,
following the repository use-case and adapter workflow. Run only affected tests
and relevant typecheck/format/lint/build checks. This documentation change runs
no benchmark, runtime test, release build, migration or deployment, and does not
bump package versions.
