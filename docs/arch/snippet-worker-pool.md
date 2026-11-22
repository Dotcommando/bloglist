# Edited Snippet Worker pool

CMS 0.11.0 implements the first optimization in ADR 0063. One lifecycle-owned
pool is injected into the loader execution adapter by the shared publication
runtime providers. Build, Request and preview use the same mechanism. There is
no per-call Worker fallback. Compilation-only adapter instances need no pool;
executing an edited Snippet requires one.

## Limits and admission

| Environment variable | Default | Valid values |
| --- | --- | --- |
| `ZARYA_SNIPPET_POOL_SIZE` | 4 | Integer 2..16 |
| `ZARYA_SNIPPET_POOL_QUEUE_LIMIT` | 256 | Integer 1..4096 |
| `ZARYA_SNIPPET_POOL_QUEUE_WAIT_MS` | 1000 | Integer 1..10000 ms |
| `ZARYA_SNIPPET_POOL_EXECUTION_TIMEOUT_MS` | 10000 | Integer 1..10000 ms |
| `ZARYA_SNIPPET_POOL_MEMORY_BUDGET_MB` | 512 | Integer, at least `size * 84 + 32`, at most 2048 |

Settings are validated and frozen at bootstrap. Each Worker has a 64 MiB old
generation, 16 MiB young generation and 4 MiB stack limit. The aggregate budget
also reserves 32 MiB for admitted serialized input/code. It describes configured
limits, not an operating-system RSS ceiling; measure actual RSS separately.
Per-job JSON input is bounded to 8 MiB, compiled code to 2 MiB, output and each
outgoing bridge message to 2 MiB, and a bridge reply to 8 MiB. Each invocation
admits at most 2048 distinct bridge calls.

At most `size - 1` nonpublic jobs run together, reserving capacity for public
Request rendering. Preview is nonpublic. Eligible queued jobs retain FIFO order;
public jobs may pass background jobs blocked by this reservation. Admission
does not make Snippets within a document execute concurrently.

The invocation deadline starts before queuing and includes queue wait, thread
startup and execution. The caller's earlier cancellation still applies. Queue
overflow, expiry and serialized-payload saturation produce the existing sanitized
unavailable outcome (HTTP 503 for a required public Snippet). Aborted queued jobs
never execute. There is no automatic replay after a timeout or Worker crash.
Optional fallbacks keep the existing loader contract.

## Isolation and lifecycle

Every job creates a fresh VM realm, JSON input, scoped CMS proxy, result state,
message correlation and timers. Only the selected frozen compiled code is sent
to a public invocation. Job identities guard bridge replies; late host replies
cannot reach another invocation. Reusing a thread never reuses its realm.

A job drains realm messages immediately after initial evaluation and every CMS
reply. VM microtasks run at the evaluation checkpoint (`afterEvaluate`), under
the existing evaluation timeout; no periodic polling timer or host callback is
exposed to edited code. Promise chains, parallel calls and completion therefore
advance through bridge events without a fixed five-millisecond polling interval.
A successful job releases its thread only after its result has been drained.
Jobs with unawaited CMS calls are discarded rather than reused. Execution errors,
timeouts, aborts, thread crashes and protocol violations discard their thread.
Replacement occurs on demand, after termination, within the same capacity limit.
Completed host-side commands survive later failure and are never replayed.
Shutdown stops admission, rejects queued/running jobs and terminates the pool.

Each invocation owns an AsyncResource so reused Worker callbacks retain the
current request's diagnostic context. Metrics distinguish `worker-queue`,
`worker-startup`, `script`, `bridge`, `transfer` and `cleanup`. Queue/startup
intervals include cold startup where applicable; warm startup measures dispatch
and fresh-realm readiness. Parent/child stage durations must not be summed to
claim total latency. The internal pool snapshot reports occupancy, creation,
discard and admission-rejection counters without request payloads.

Migration `0008-snippet-pool-observations` extends the statistics validator with
`worker-queue`. Apply and verify it before starting the updated installation.
Earlier migration files and receipts remain unchanged. The Request plan format,
publication assets, cache policy and HTTP no-store behavior are unchanged.

## Comparing changes

Record a baseline before replacing the installation's engine. Use the same
activated release, routes, representation, diagnostics setting, Node/toolchain,
hardware, warmup, sample count and concurrency for each comparison. Keep the
first request separate from warmed samples. Record server preparation and client
TTFB separately, including failures and diagnostic loss. Save run labels, UTC
time windows, CMS version, raw timing observations and process memory in private
installation evidence, outside public artifacts and Git.

The administration's Page statistics can compare CMS versions. For successive
changes within the same version, compare the saved run windows and labels;
an all-day version aggregate mixes those experiments. The fixture-based load
profile in ADR 0062 remains the reference for broader capacity claims. Local
site measurements establish only the behavior of those pages on that machine.
