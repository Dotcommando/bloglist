# Page resolution diagnostics boundary audit

Date: 2026-11-07

Scope: ADR 0066 recording, public response lifecycle, diagnostic failures and
the dependency boundaries of the diagnostics capability.

## Response and recording order

The HTTP observer captures arrival with a monotonic clock. Its first write/end
captures preparation time; finish, or close for an interruption, captures the
separate completion time. Both are scalar snapshots before any record validation,
queue admission, serialization or persistence.

Submission requires both transport completion/disconnection and a settled
handler. A setImmediate callback then waits for bounded stage cleanup and submits
the snapshot to a bounded sink. The sink schedules the recording use case in
another deferred callback. No page handler awaits storage. Node finish means
handoff to the transport, not confirmed receipt by the remote browser.

In-memory stage instrumentation runs during rendering and has some overhead.
The guarantee excludes deferred recording work from the measured intervals;
it does not claim instrumentation has zero cost or that background writes cannot
compete for shared CPU/database capacity with other requests.

## Failure isolation

The review reproduced one missing guard: waitForCompletion is typed to return
a Promise, but an implementation can throw synchronously before returning it.
That throw escaped the setImmediate callback. Calling it within a Promise
continuation now routes both synchronous throws and rejections to the existing
failure handler. A throwing sink and record construction are also contained.

The sink catches synchronous and asynchronous recording failures, updates its
site-scoped loss count and continues without retries. A pending write occupies
one admission slot; it does not retain a page's HTTP completion. The bounded
queue drops overflow instead of waiting in public delivery.

## Hexagonal boundaries

- Recording and statistics use cases depend on domain values and outbound
  interfaces. They do not import Node HTTP, NestJS, MongoDB/Mongoose, Temporal,
  timers, AsyncLocalStorage or concrete adapters.
- Ports expose observations, durations, calendar ranges and grouped statistics.
  They expose no models, query builders, sessions, BSON identifiers, workers,
  request/response objects or storage commands.
- HTTP lifecycle, deferred scheduling and trace context remain in adapters.
  MongoDB aggregation, validators and TTL representation remain in persistence
  adapters/migrations. IANA calendar conversion remains in its calendar adapter.
- Site authorization is obtained through an explicit site-reading port whose
  adapter invokes the existing authorized inbound operation. Statistics do not
  read the sites collection directly.
- Stage names, including worker-startup, are the closed diagnostic vocabulary
  agreed in ADR 0062. They are metric labels, not worker objects or provider APIs.
  Technical stages are reported by adapters; rendering use cases report semantic
  stages through the observation port.
- Infra reads the CMS version and binds concrete implementations. The permanent
  layer-import check now also recognizes diagnostics for repository ownership.

No abstraction leak was found in these reviewed contracts and dependencies.

## Executable evidence

The HTTP observer regressions cover finish/close ordering, single submission,
fixed ready/completion times, query omission, unchanged delivery errors and
throwing/rejecting cleanup or submission. A real isolated streaming HTTP server
proves the client receives the complete successful page while recording is
blocked, and while storage throws or rejects. Advancing the fake recording clock
by 1000 ms leaves the captured 12/35 ms intervals unchanged.

Existing controller, sink, application-composition and layer-import checks remain
part of focused verification. These checks are functional guarantees; the
separately deferred load/overhead experiment remains outside this audit.
