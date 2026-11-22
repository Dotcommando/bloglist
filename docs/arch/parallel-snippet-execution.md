# Parallel Snippet execution

CMS 0.11.0 implements the second optimization in ADR 0063. The application-owned
Snippet scheduler shares one process admission budget and creates a separate
read budget for each render. The template adapter translates validated lexical
declarations and selected chunk scopes into dependency tasks. It does not own
admission limits or invoke persistence to decide scheduling.

## Explicit execution contract

Edited Snippet source and trusted registered Snippet descriptors may declare
`execution: SnippetExecution.ParallelRead` (serialized as `ParallelRead`). This
asserts that the implementation has no externally observable effects and may
overlap other declared safe reads. Missing metadata and `Sequential` preserve
ordered, command-capable execution. Safety is never inferred from source text.

The Snippet editor exposes Allow parallel reads (CMS commands disabled). Saving
this field uses the normal guarded source save/backup contract. Publication
captures source metadata and a `snippetExecutions` map for registered identities
and name aliases in the private immutable plan. Editing current metadata cannot
change an activated release. A plan without that map keeps sequential execution,
even if a current registered provider later declares parallel safety. Invalid
metadata fails validation; a published safe registration whose current provider
no longer honors the declaration fails instead of gaining command access.

Opted-in invocations receive a query-only scoped CMS client in Build, Request and
preview. Core operations use an explicit query catalogue. Preview/render
operations that can execute commands are excluded. Add-on operations must declare
Query; Command operations fail before dispatch. The query-only context propagates
into extension calls and their supplied CMS client. Trusted registered providers
must also honor the absence of direct external effects. This contract adds no
administrator permission, authorization bypass or rollback of completed writes.

## Dependencies, scopes and errors

Validate unique identities, missing dependencies, cycles and execution modes
before dispatch. Parameter references and explicit dependsOn declarations form
the local graph. The stable depth-first dependency order preserves the previous
effective order of command-capable declarations, including forward dependencies.
Consecutive safe nodes execute as dependencies become ready. Unclassified or
command-capable nodes flush prior safe work and remain ordering barriers.

Safe sibling chunk scopes and Each instances may overlap. A render shares its
read budget across all nested scopes; scope orchestration never holds a read
permit while awaiting children. All reachable calls in a parallelized subtree
must be safe for that phase, or frozen Build data. Conditional safety analysis
examines both branches but executes only the selected branch. Lexical aliases,
typed forwarding, Each item identity and request restrictions remain intact.
HTML fragments are assembled in source/array order, independent of completion.
Frozen-value and root-alias dictionaries use stable key order.

One in-flight promise is installed before every physical execution for the
existing per-render deduplication key. Concurrent aliases share it. Required and
optional calls remain distinct; only declared typed fallbacks recover optional
errors. A required failure aborts dependent/queued work and signals running
siblings; no partial success document is returned. Cancellation cannot undo
commands that completed under sequential execution.

## Limits and diagnostics

| Environment variable | Default | Allowed values |
| --- | ---: | --- |
| `ZARYA_SNIPPET_PARALLEL_PER_RENDER` | 4 | Integer 1..16 |
| `ZARYA_SNIPPET_PARALLEL_PER_PROCESS` | 16 | Integer per-render limit..64 |
| `ZARYA_SNIPPET_PARALLEL_QUEUE_LIMIT` | 256 | Integer 1..4096 |
| `ZARYA_SNIPPET_PARALLEL_QUEUE_WAIT_MS` | 10000 | Integer 1..10000 ms |

Bootstrap validates and freezes settings. These budgets bound safe invocations
for registered as well as edited Snippets; the existing Worker pool independently
bounds physical threads. Each render/process admission queue is bounded and
cancellable. Saturation or expiry has the existing sanitized unavailable outcome.
The loader deadline still bounds an admitted invocation. No job is replayed.
Shutdown stops admission and cancels pending schedules.

The `snippet-scheduling` interval records application scheduling alongside the
existing snippet, deduplication, Worker queue/startup and bridge intervals. Nested
or overlapping intervals must not be summed as document duration. Migration
`0009-parallel-snippet-execution` adds optional source metadata to the rendering
validator and the new diagnostic stage. Earlier migrations remain unchanged.

## Verification and measurement

Use deterministic gates to prove overlap, dependency chains/diamonds, global and
render limits, cross-scope isolation, Each order, dormant If branches, command
barriers, cancellation, deduplication and required failure. Exercise metadata
through source parsing, plan serialization, publication, query-only core/add-on
dispatch and HTTP delivery. Legacy plans must remain sequential and usable.

Compare equivalent private installation runs against the Worker-pool baseline
using the same activated plans, routes, load profile and pool settings. Existing
pages need multiple eligible calls to gain latency from this optimization; a
single Request Snippet receives no intra-Snippet concurrency automatically.
Neither public document caching nor cross-request Snippet memoization is added.
