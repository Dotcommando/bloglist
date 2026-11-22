# Request document cache

## Per-request purpose and cache incompatibility

A Request Snippet is intended to execute separately for every page request, using
the current validated request context and the selected release's code. It is not
a Build value and does not become an independently fetched browser fragment.
Within-request deduplication does not authorize cross-request result reuse.

**Whole-page caching can break this behavior.** The current document cache returns
complete HTML on a hit without rerunning its Request Snippets. Background refresh
is not execution for each visitor request. Time-dependent or current-data logic
can therefore be skipped or stale even though the page returns HTTP 200. A
snippet's SharedPublic declaration and HTTP no-store do not restore per-request
execution. Browser widgets may still work through their separate API calls.

Before enabling whole-page caching, check that the complete page composition has
no Request Snippet invocations. Until an automatic guard exists, perform this
check manually and leave page caching off when Request Snippets are present.
[ADR 0087](../adr/0087-request-snippets-and-page-cache-guard.md) records the required
future editor warning and backend/publication validation. That strict absence
check is not implemented; current explicitly opted-in Request caching below
still describes the running software, not the intended stricter policy.

The current shared-public policy and bounded pre-expiry refresh follow ADRs 0063
and 0074. Pages without a published cache policy execute their Request phase for
each document request reaching the CMS. HTTP responses retain
`Cache-Control: no-store`; this feature reuses documents inside one server process.

## Concurrent release reads

The filesystem publication store shares overlapping reads of the same site,
release and verification level, including the database metadata read and the
requested filesystem integrity checks. It retains at most 128 in-flight groups;
additional distinct reads execute normally. Each caller receives detached state.
The group is removed on success or failure, so later reads recheck storage.
Metadata-only reads cannot satisfy full artifact verification. Different sites,
release identities and verification levels never share a read.

This is not a retained plan cache and does not cache active-release selection,
site add-on enablement or availability. Public operations still perform their
own current authorization and publication checks. Single-page and full-site
publication both create new immutable release identities and switch activation;
neither changes a previously activated plan in place.

## Currently implemented authoring and publication

The administration's Request-page editor has an explicit cache switch and a
lifetime in seconds (initial value 60, range 1–3600). Save draft persists the
policy without changing the active publication. Publish applies it. Disabling
the switch removes the policy from the next publication. Static and text pages
cannot enable it. The existing page-update REST operation and `UpdatePage`
accept `requestCache: { scope: 'SharedPublic', ttlMs: 60000 }`; explicit `null`
removes it, omission preserves it. `ConfigurePageRendering` also accepts the
policy in its rendering configuration.

Every reachable Request Snippet, including both conditional branches and nested
chunks, must separately declare
`cache: { scope: 'SharedPublic', maxAgeMs: 60000 }`. Edited Snippets expose this
switch and maximum data age in their editor. Registered providers declare the
same contract. Publication rejects an unclassified dependency or a page TTL
above any dependency's maximum accepted age. `ParallelRead` alone grants no
cache permission. A cache declaration does not enable parallel execution.

`SharedPublic` is an author/provider assertion: output uses only its typed
parameters, fixed site/page/language identity, frozen published-page context and
time-bounded public reads. No personal, entitlement, cookie, authorization,
draft-only, nonce or other request-private inputs are permitted. Raw HTTP
headers and caller identity are not available to the rendering context. All
declared request parameters belong to the complete cache key. Live public
data and time may be stale only within the declared interval. Native providers
must honor the contract for their external clients too; it is not inferred
from source text or operation names.

Cache-eligible execution receives a query-only CMS facade even when sequential.
CMS and add-on commands are rejected before dispatch. Normal preview/Build and
unclassified Request execution preserve their existing command semantics.
Edited code returning a fallback must call `context.cache.bypass()` before
returning it; native providers call `context.onUncacheable?.()`. The runtime
also marks optional adapter fallbacks, caught Worker CMS-bridge failures and
unfinished bridge activity as noncacheable. Arbitrary caught exceptions inside
editor code cannot be inferred: the author must signal them explicitly.

The private plan freezes the page policy, reachable Snippet cache declarations,
source and compiled code. Draft edits do not alter retained plans. Migration
0010 adds optional policy fields and the `request-cache` diagnostic stage without
rewriting earlier migrations.

## Delivery and freshness

Trusted site/route resolution, activation and private-plan integrity checks,
and request normalization/validation run before cache lookup. For opted-in
pages, ADR 0067 navigation metadata is validated against the transport budgets
and omitted during normalization. Unused parameters such as `utm_source` (with
any value) therefore share the clean URL's cache entry; no marketing allowlist
is needed. If a parameter is explicitly declared, including `utm_source`, its
typed value participates in the key. Invalid declared values or repeated scalar
inputs reject before lookup. Declared arrays retain normal typed validation.
Cookies do not disable shared reuse: raw Cookie headers and session identities
never enter the public renderer, so admin sessions, preferences and analytics
cookies cannot change a SharedPublic document. No cookie-name allowlist or
cookie-based cache key is needed. Authorization requests still bypass shared
reuse. Preview never uses this cache. See
[ADR 0077](../adr/0077-public-document-cache-and-cookies.md).

Keys contain site, selected release, plan identity and a digest of the complete
verified stored plan/assets, actual resolved path, page language, representation
and canonical normalized typed values. Object property order is canonicalized;
absent, explicit null and defaults follow the existing normalization contract.
HTML and Markdown are separate entries. GET/HEAD share document metadata; HEAD
sends no body. Complete HTML/Markdown and inline-style hashes stay together, so
Content-Length, content type and CSP are coherent. Snippets have no HTTP
response/header or Set-Cookie capability.

Only successful complete documents are stored. Errors, cancellation and
fallback output are not stored. A fallback fill is also not shared: additional
waiters perform their own bounded render. Eligible concurrent misses otherwise
share one fill. Each waiter can disconnect independently; the fill aborts when
none remain. Fills have a 10-second deadline, at most 128 concurrent fills and
1024 waiters per process, with no unbounded fill queue. Physical work retains
its admission reservation until it settles, even if a dependency ignores an
abort after the response deadline. Shutdown also cancels independent fallback
fills. Saturation/deadline
failure maps to unavailable (503); no stale response is substituted.

TTL starts after generation succeeds and uses a monotonic clock. Expired entries
are removed and regenerated. There is no stale-while-revalidate, event-based
invalidation or stale-on-error behavior. Freshness is explicitly eventual:
public schedule/availability text can remain unchanged until TTL expires;
business commands still enforce their own current rules.

New and routing-only releases have different namespaces. Retained-release
rollback can reuse that release's still-unexpired entry. Late old-release fills
cannot become entries for a new release. In-process dump/replacement maintenance
purges before and after the operation; its generation fence prevents a late
pre-purge fill from repopulating the cache. Offline restore/removal requires all
application processes stopped; restarting creates an empty cache. No cross-process
coherence is claimed.

## Refresh before expiry (0.12.0)

ADR 0074 schedules each retained eligible representation at its expiry minus
20 seconds. TTLs of 20 seconds or less have no background refresh; the editor
warns immediately when such a value is entered. A successful refresh starts a
new TTL and schedules its next cycle. Failed, noncacheable, canceled or timed-out
refreshes leave the original expiry unchanged. Once expired, visitors join
already admitted work or perform an ordinary bounded fill; expired content is
never served.

The application captures normalized public values, checks the current active
release and verified plan fingerprint before dispatch and before accepting the
result. A shared rendering service supplies foreground and background behavior.
One reusable Worker performs composition, final HTML processing and Markdown.
Its data bridge uses frozen cache-safe identities/contracts and the normal
query-only loader boundary. Edited Snippets run in the existing reserved pool;
the refresh Worker creates no nested pool or database connection.

At most 256 refresh schedules retain 8 MiB of accounted inputs. At most 17
background jobs share the fill map, leaving foreground admission capacity.
The Worker accepts one active job and 16 queued jobs, a one-second queue wait,
ten-second total deadline, 8 MiB messages and 32 MiB accounted queued inputs.
Heap limits are 256 MiB old, 32 MiB young and 4 MiB stack. Saturation rejects
refresh; it never reroutes CPU work onto the HTTP event loop. Native providers
must still honor cancellation and their public-read contract.

Publication checks fence old results; maintenance immediately cancels schedules
and active work and advances the cache generation. Canceled physical work keeps
its reservation until termination and bridge settlement. Visitor disconnects do
not cancel a refresh owned by the cache. Shutdown cancels all schedules/jobs.
Coordination is process-local: independent HTTP processes have independent
entries, timers and admission. Refresh improves waiting at renewal; it does not
promise lower generation CPU time.

## Bounds and diagnostics

Validated bootstrap settings (also available in local `.env`/`.env.example`):

| Variable | Default | Unit |
| --- | ---: | --- |
| `ZARYA_REQUEST_CACHE_MAX_ENTRIES` | 256 | retained representations |
| `ZARYA_REQUEST_CACHE_MAX_BODY_BYTES` | 2097152 | UTF-8 HTML plus Markdown bytes per entry |
| `ZARYA_REQUEST_CACHE_MAX_TOTAL_BYTES` | 33554432 | accounted retained memory bytes |

Entry count is 1–4096, body limit 1 KiB–8 MiB and total limit at most 256 MiB and
at least the body limit. The memory adapter uses conservative UTF-16 serialized
content/key accounting plus entry overhead; this is an accounted cache budget,
not a claim about total process RSS. Oversized successful documents are delivered
but not retained. Expired entries and least recently used entries are evicted.
Eviction requires no timer; eligible retained entries have bounded refresh timers.
Shutdown cancels refreshes and clears retained documents.

Opted-in responses identify retained hits, new fills, shared waits and explicit
fallbacks through `X-Zarya-Cache: hit|miss|coalesced|bypass`. The `request-cache`
stage measures lookup/fill wait in private diagnostics. Existing trace truncation
limits still apply. Performance reports must distinguish real hits, misses and
coalesced requests, identify forced-miss instrumentation, and preserve latency,
errors, memory, Worker settings and diagnostic overhead.
