# ADR 0063: Request runtime optimizations in CMS 0.11.0

Date: 2026-11-06

Status: Accepted for CMS 0.11.0 through the owner's explicit planning request.
The Worker pool and bounded parallel execution are implemented for 0.11.0; see
the [pool contract](../arch/snippet-worker-pool.md) and
[parallel execution contract](../arch/parallel-snippet-execution.md). Explicit
[Request caching](../arch/request-document-cache.md) is implemented, with an
administration TTL setting initially 60 seconds. Persisted AST compilation remains pending. Performance claims require
the recorded comparison for each change.

## Context and release scope

Schedule four changes for 0.11.0: a reusable Worker pool for edited Snippets,
bounded parallel execution of independent safe Snippets, explicitly configured
Request-document caching, and template AST compilation during publication.
[ADR 0062](0062-request-rendering-metrics.md) delivers the measurement baseline
in 0.10.1. Profiling determines tuning and demonstrates benefit; all four changes
remain the agreed 0.11.0 scope, including AST compilation.

Existing code creates a Worker per edited Snippet read, tokenizes frozen markup
and parameter expressions during composition, and awaits declarations in order.
RenderDataService already memoizes matching executions within a render. The
current Request HTTP response uses no-store. Publication already freezes Build
values, compiled Snippet JavaScript and prebuilt frontend assets: AST compilation
extends that model rather than moving those activities onto public requests.

[ADR 0044](0044-system-object-api-and-bilingual-guide.md) allows both queries and
commands in Snippets, including Request and preview. Completed commands survive
a later rendering failure. Therefore data dependency analysis alone cannot prove
that two calls may run concurrently or that a render may be skipped on a cache
hit. Preserve those effects and ordering for existing and unclassified Snippets.

## Decisions

### Reuse Workers with fresh invocation state

Replace per-invocation thread creation in ScriptSnippetAdapter with a bounded,
process-owned pool wired through composition. Workers are a technical adapter
concern, not application business types. Share the execution mechanism across
Build, Request and preview while preserving their distinct contexts and
cancellation; bound aggregate process resources so publication cannot consume
all public-delivery capacity without an explicit admission policy.

Reuse the Worker thread, never the VM realm or invocation state. Every job gets
a fresh realm, JSON input/context, result state, timers, message correlation and
a site-scoped CMS bridge. No previous globals, pending promises, CMS replies,
source revision or output may leak into another job, site or release. Execute
only the selected release's frozen compiled code for public requests. Discard
a Worker when cleanup or isolation cannot be established.

Bound pool size, queue length, queue wait, execution deadline, memory and output.
Validate settings and the aggregate resource budget at bootstrap. Queue wait
consumes the caller's remaining deadline; queued jobs abort without executing.
Timeout, crash, protocol violation and cancellation terminate/discard the affected
Worker before replacement. Ignore late replies and reject its job exactly once.
Shutdown stops admission and settles queued/running jobs with bounded cleanup.
Saturation maps to an explicit sanitized unavailable outcome under the existing
HTTP failure contract; no unbounded queue or silent per-call Worker fallback.

Do not automatically replay a job after timeout/crash: a CMS command may already
have committed. Killing a Worker does not roll back host-side CMS operations.
Preserve each operation's existing cancellation, idempotency and uncertain-outcome
contract. Late bridge results cannot reach a different job. Hook execution pools
and changes to hook retry/durability are outside this decision.

### Execute independent safe Snippets concurrently

Schedule ready nodes of the validated dependency graph with bounded concurrency
per render and per process. A node waits for all explicit dependencies and all
values referenced by its parameters, including aliases forwarded through chunk
inputs and Each/If scopes. Reject cycles and missing dependencies before execution.
Preserve lexical scopes, phase restrictions and deterministic HTML/array order,
regardless of completion order. Do not speculatively execute an unselected branch.

Introduce explicit execution metadata identifying side-effect-free, parallel-safe
reads; missing metadata preserves current sequential behavior. Freeze it with
code/contracts in release plans, and validate it for registered as well as edited
Snippets. A query-only execution facade for opted-in reads rejects commands,
including add-on commands, before dispatch. This is an optimization contract,
not a new administrator permission/grant system. Trusted registered providers
must also honor the declared absence of external effects.

Command-capable or unclassified calls remain ordering barriers: safe work must
not be moved across their observable effects merely because aliases are
independent. Do not infer safety by searching code text. Do not change Build or
preview command semantics as an incidental consequence of optimizing Request.

Keep one in-flight promise for each existing per-render deduplication key before
starting work; concurrent consumers await that promise. Preserve current key and
required/fallback distinctions rather than introducing cross-request Snippet
memoization. Required failure cancels queued/dependent work and signals running
siblings, returning no partial success document. Optional failures use only their
explicit typed fallback. Cancellation cannot promise reversal of committed effects.

### Cache Request documents only under an explicit publication policy

Keep caching disabled and HTTP no-store by default, including for legacy plans.
Add an opt-in shared-public response policy with an explicit finite positive TTL
and finite entry/body/total-memory budgets. Freeze the policy in the published
plan; editing a draft does not change an active release. Use a bounded in-process
cache initially, with no Redis/service dependency or cross-process coherence claim.

Enable this policy only for entirely public, side-effect-free rendering whose
complete variability is declared. A parallel-safe read is not automatically
cache-safe: it must separately declare acceptable staleness and cache inputs.
Reject incompatible explicit policies at publication, including command-capable
or unclassified dependencies. The initial shared cache excludes personalization,
user/entitlement-dependent data, cookie/authorization-dependent content, previews
and responses requiring per-request nonces. A response that sets cookies or
otherwise violates the shared-public contract is not stored or shared.

After trusted site/route/release resolution and input normalization/validation,
key entries by siteId, selected releaseId, plan identity/content digest, actual
route/path context, language, negotiated representation, canonical typed request
values and every declared output-affecting public context dimension. Preserve
distinctions between absent, null and defaulted values according to normalization.
Unknown/duplicate/invalid inputs cannot obtain a hit by bypassing validation.
Equivalent normalized values may share an entry; unchecked Host, raw headers or
arbitrary query strings cannot define trusted scope. Under ADR 0067, bounded
unused navigation metadata is deliberately omitted by normalization and shares
the same entry, including arbitrary `utm_source` values. The owner's 2026-11-09
clarification explicitly requires cache hits for these referral links. A declared
parameter still undergoes typed validation and participates in the key.

Cache only a completely successful validated representation with its coherent
content type, CSP/style hashes and body metadata. HTML and Markdown do not collide;
GET/HEAD use the same representation metadata and HEAD returns no body. Do not
cache failures, aborts, partial output or optional-fallback renders in the initial
policy. Coalesce concurrent misses for an eligible key, but one disconnected
waiter cannot cancel work still needed by other waiters; cancel when none remain.
Apply the same bounded admission/deadline policy to cache fills.

TTL measures freshness from successful generation using a monotonic clock.
Expiry causes a fresh render; no stale-while-revalidate or serve-stale-on-error
behavior is implicit. Live data changes can remain invisible only within the
explicitly accepted TTL. Longer-lived or event-invalidated caching needs a
separate explicit freshness contract, not a guessed hook invalidation rule.

A new activation, routing-only release or rollback uses its own release namespace;
a late fill for the former release cannot populate the newly selected one.
In-flight requests retain their originally selected activated release. Bound and
evict old entries; purge affected entries on installation/site restoration,
removal or other replacement that invalidates their identity assumptions.
Never fall back to cached draft data or another site's/release's response.

Server reuse and browser/CDN caching are separate policies. This first opt-in
policy permits server reuse while retaining HTTP no-store. It does not silently
relax edge/browser headers. Public cache headers, private user caches and cached
individual Snippet results require separate contracts if later requested.

### Retain verified parsed Request plans

The owner's 2026-11-09 request authorizes a bounded process-local cache of decoded,
verified immutable Request plans. This is distinct from persisted template ASTs
and from the TTL-governed HTML cache. See the
[parsed-plan cache contract](../arch/parsed-request-plan-cache.md).

Key by trusted siteId, selected releaseId and planId. Verify the complete stored
plan and its asset references before first retention; return detached copies to
callers. Retain neither active-release selection nor live authorization decisions.
Single-page, full-site and routing publication create a new release namespace,
including for reused plans. Purge before and after dump maintenance and fence
in-flight pre-purge reads so restored identities cannot reuse stale plans.

### Compile template ASTs into private publication plans

At publication, tokenize and validate the full reachable template/chunk graph,
including both conditional branches, Each targets and parameter-value expressions.
Serialize a versioned immutable AST and dependency/execution metadata into the
private Request plan. Keep lexical scopes, source locations, source revisions,
name/key resolution and compiled Snippet contracts/code together. Dynamic values
remain typed data and never become reparsed template syntax.

Request execution evaluates this saved representation with frozen Build values
and current Request values; newly published plans do not tokenize raw template
or parameter strings, transpile Snippets, rebuild CSS/JS or read editor sources.
Keep the existing tag adapter and supported syntax; do not introduce a general
language/compiler, eval-based renderer or public executable plan. Runtime output
escaping, typed-value validation and CSP/CSS placement remain enforced.

Version the persisted plan envelope/AST and include it in integrity verification,
release reuse, single-page publication, routing-only releases, dump/restore and
runtime/deployment compatibility checks. A reused plan retains its compiled
meaning while existing asset requalification rules continue to apply. Corrupt or
unknown versions fail explicitly; activation must not create output unsupported
by the configured target runtime. Do not rewrite applied migration checksums or
silently mutate an activated release.

Retain delivery of supported legacy source-only plans using an explicit versioned
reader. It may parse the verified frozen legacy sources once into a bounded,
site/release/plan-scoped in-memory representation; never read drafts or persist
changes back into the old release. Cold legacy parsing remains separately visible
in metrics. Test upgrade, rollback and mixed retained-plan releases rather than
requiring republication merely to keep existing pages available.

## Implementation boundaries and verification

Application services own scheduling/freshness decisions through explicit ports;
AST parsing, Worker lifecycle and cache storage stay in adapters, with immutable
validated settings and lifecycle wiring in infra. Agree exact metadata fields,
port/configuration contracts, numeric budgets and failure mappings before their
implementation. Version affected stored schemas through additive migrations
where needed. Update English/Russian authoring and operator documentation with
actual configuration and failure behavior when implemented.

Implement and verify in this order: pool, parallel execution, response cache,
then persisted AST. Measure each change against the 0.10.1 fixtures and repeat
the combined comparison. This keeps attribution possible and does not defer the
AST work out of 0.11.0. Add focused regressions at the observable boundaries:

- Pool: reuse, fresh-realm/site/release isolation, bounded saturation, timeout,
  crash/replacement, abort, late CMS replies, cleanup/shutdown and no command replay.
- Scheduler: independent overlap, dependency chains/diamonds, duplicate concurrent
  consumers, nested scopes/branches, stable output, command barriers, failure and
  cancellation. Use deterministic gates rather than fragile timing assertions.
- Cache: default bypass, complete-key isolation, typed normalization, HTML/Markdown,
  GET/HEAD/CSP, expiry, coalescing/disconnect, eviction, invalid policies, failures,
  fallback exclusion, release switch/rollback/restore and a late old-release fill.
- AST: output/error parity for typed forwarding, escaping, Each/If, chunk aliases,
  source diagnostics and JSON-LD values; no new-plan request-time parsing; corrupt,
  unsupported and legacy plans; retained releases and publication failure atomicity.

Run relevant application/adapter tests, architecture checks, typecheck,
format/lint/build and focused isolated composition/HTTP integrations under the
repository cadence. Keep synthetic environments separate from site installations.
Use the load profile in ADR 0062, report latency/throughput alongside memory,
Worker/queue counts, errors and diagnostic overhead, and compare equivalent cache
miss/hit and cold/warm conditions. Claim gains only from observed measurements;
correctness, isolation and publication guarantees are acceptance requirements.

## Consequences and alternatives

The owner's 2026-11-09 refinement replaces Worker polling with realm microtask
checkpoints after initial execution and CMS replies. Events advance without
exporting host callbacks into the realm; evaluation deadlines, fresh realms,
late-reply correlation and discard rules remain enforced. Concurrent publication
store reads may share one in-flight operation only for identical site, release
and verification level. Groups are bounded and removed when settled; this does
not retain active-release or add-on authorization decisions between calls.

The changes add pool lifecycle, scheduling metadata, freshness policy and a
persisted-format compatibility obligation. Explicit opt-in preserves existing
command behavior and no-store semantics; legacy pages gain no automatic promise
of parallelism or cache hits. CPU-bound scripts, CMS calls and provider latency
may dominate different workloads, so a pool alone cannot guarantee lower TTFB.

Prefer the least dynamic data lifecycle satisfying freshness: authored
Template/Chunk/TV data, then frozen Build Snippets, then Request Snippets when
initial HTML requires current data. Browser API interaction remains independent.
Hooks may prepare data only under their own explicit consistency/freshness policy.
This guidance adds no content collections or business capability. Keeping
per-call Workers, using unbounded Promise.all, enabling caching globally or merely
memoizing parsed sources without a publication format does not meet this scope.

This ADR records future delivery decisions. It implements no runtime behavior,
runs no benchmark and changes no package version or deployment authorization.
