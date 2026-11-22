# Publication availability and fork failure boundaries

This contract supplements ADR 0007, ADR 0083 and ADR 0084. It introduces no new
publication API or serving-process limit.

## Publication

Build and verify an immutable release before atomically changing its active
database pointer. Keep serving the current release while building; do not restart
site workers, remove the active release or acquire an exclusive restore gate for
ordinary publication. Every request selects one release. Its document, Request
plan, cache key and assets remain scoped to that release. Retain older activated
releases for in-flight documents and subsequent browser asset requests.

An active pointer is read from the database, not a process-local cached pointer.
Parsed plans and document caches include release identity. Activation therefore
does not require a broadcast to clear all workers before new documents can be
served. Requests already using the previous release may complete after activation;
requests selecting a release afterwards use the new one. Concurrent activation
retains the expected-active-release guard. Failed staging never switches the
pointer. Existing activation receipts handle uncertain activation acknowledgements.

This removes a publication maintenance window. It does not promise availability
through loss of the coordinator, database, machine or exhausted CPU/disk capacity.
Multiple serving processes do not make the single coordinator a redundant host.

## Resource changes and failures

Save allocation through an exclusive temporary file and atomic rename before
advertising a new saved version or changing live workers. A failed save preserves
the previous saved version, including when discovering an additional site.
Remove failed temporary files. A confirmed save followed by an application failure
retains the new desired configuration and reports its difference from live state.
Corrupt saved configuration fails closed rather than being replaced by defaults.

Start a replacement and verify readiness before retiring its predecessor. Drain
accepted requests before closing their providers. Observe drain deadlines and
report forced termination. If the successor exits during the drain, refill the
desired pool before reporting successful reconfiguration. During shutdown reject
late readiness and share a worker's existing stop operation. Remove exited worker
records and owned event handlers so repeated changes do not accumulate them.

Only one resource change is admitted at a time. Concurrent HTTP saves with one
expected version produce one success and one conflict; a stale retry cannot
perform another reconfiguration. A lost worker may abort its current request.
The proxy must not replay a mutation whose storage outcome may already be committed.

A reused idle private HTTP socket can reset as the coordinator selects it. Retry
only an ECONNRESET on a reused socket, once, for GET/HEAD with neither transfer
encoding nor a positive content length, before response headers and while the
client remains connected. Open the retry without the pooled agent so another
stale idle connection cannot be selected. Forward it to the same selected worker;
do not fall back to a different site. Never retry a request body, a mutation, a
fresh-socket failure or an HTTP error response. Abort the active retry when its
client disconnects. A failed partial response is destroyed rather than completed
as a successful truncated document.

## Focused verification

All fixtures use temporary private directories and uniquely named test databases.
The fault cases never stop a site database or create a dump. The real-process
fixtures instrument the compiled production worker; test-only IPC gates and HTTP
write probes do not enter application source or installed runtime code.

| Boundary | Permanent regression |
| --- | --- |
| Three warm workers, static/Request publication, continuous traffic, old request completion, retained CSS and failed staging | `test/integration/fork-publication.integration.spec.ts` |
| Long request during rolling pool replacement; real worker kill, last-worker loss and neighbor/control isolation; coordinator kill, orphan exit and restart from saved allocation | `test/integration/fork-resilience.integration.spec.ts` |
| Refused connection and unresponsive MongoDB during replacement; old workers survive and retry applies the saved target | `test/integration/fork-database-faults.integration.spec.ts` |
| Two simultaneous authenticated administrative saves and a stale retry | `test/integration/fork-admin-concurrency.integration.spec.ts` |
| Worker dies after writing but before HTTP acknowledgement; no mutation replay | `test/integration/fork-write-disconnect.integration.spec.ts` |
| Twelve real pool/allocation changes in one coordinator, with old children reaped | `test/integration/fork-soak.integration.spec.ts` |
| Sixty deterministic pool/allocation cycles, released event handlers, successor death during drain, shutdown/readiness race and forced drain deadline | `test/adapters/site-process-races.spec.ts` |
| Disk full, access denied, rename failure, failed additional-site save, recovery and corrupt allocation | `test/adapters/resource-persistence-faults.spec.ts` |
| Large streaming POST/response integrity, canceled upload without commit, canceled backpressured response | `test/adapters/process-proxy-streams.spec.ts` |
| Reset reused GET/HEAD socket, one fresh retry, failed retry, disconnected client, POST committed before reset, request body and partial-response exclusions | `test/adapters/process-proxy-retry.spec.ts` |

Keep existing resource-browser regressions in
`test/integration/database-pool.integration.spec.ts`: loader visibility, completion
feedback, late GET fencing and reconciliation after an uncertain POST response.
Run selected files explicitly; the older combined supervisor/dump integration test
also creates archives and is unsuitable for verification with dumps prohibited.

Build the server before real fork tests: children load `dist/` while the test
runner loads TypeScript. Set `ZARYA_TEST_MONGO_URI` to an explicitly isolated
transaction-capable MongoDB instance. Browser checks additionally require
`ZARYA_TEST_BROWSER_EXECUTABLE`. Execute process fault tests on both native Windows
and Linux; Linux test containers use an init process to reap orphaned descendants.
