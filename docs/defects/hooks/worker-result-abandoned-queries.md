# Worker results could abandon admitted host queries

- ID: `hooks/worker-result-abandoned-queries`.
- Kind: confirmed bug. Status: fixed; regression and bounded review checks passed.
- Discovered: 2026-11-18. Affected baseline: `318a475b0ffb8c121e8dc6c9efec8e29609b30ba`
  (0.15.1 metadata); earlier range unknown. Fix target: 0.15.2, unpublished.
- Read for: HookScriptRuntime.evaluate, granted query bridge, fire-and-forget
  script queries, worker finish/timeout, losing query failure and shutdown.

A handler could start a granted query without awaiting it and return a result.
The host returned that result while the query remained pending, ignored its late
failure and detached worker termination. A source operation/provider shutdown
could therefore advance while its admitted read was still running.

Fence further messages at finish, request cooperative query cancellation, observe
worker termination and settle every admitted query before returning. Preserve
unexpected late query/cleanup failures through the operation boundary; a completed
handler's unused query may acknowledge expected cancellation. Active query errors
still use the existing failed-query bridge reply. No command/data authority is added.

The caller gets the actual result only after owned work settles, or its existing
safe HookUnavailable/failed-delivery outcome. The worker CPU deadline still stops
script execution; completion also owns query-port cleanup under those ports'
existing dependency deadlines. Ports unable to cancel are awaited, not abandoned.
No operator JS-object workaround or new capacity/total-latency claim is introduced.

[Real-Worker regression](../../../test/adapters/hook-runtime.spec.ts):
`settles admitted queries (late failure: $lateFailure, cooperative cancellation: $cooperative)`.
Executed RED returned allow=true while the controlled read remained pending.
An additional late-failure RED returned success after the read rejected. GREEN
signals cancellation, waits for explicit query completion and preserves the late
failure. Real compilation, Worker messaging and shutdown are used; the host read
is deterministically gated. No production outage or exploit is asserted.

Follow [hooks](../../arch/hooks.md),
[async ownership](../../cms-development/feature-design.md#asynchronous-ownership-and-cleanup)
and [review evidence](../../changes/0.15.2/addons-calibration-deployment-hooks-qa/50-verification.md).
Existing ownership rules already covered this path; earlier tests awaited every
script query and did not exercise work surviving the worker result.
