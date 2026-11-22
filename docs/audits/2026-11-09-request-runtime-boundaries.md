# Request runtime boundary and cancellation audit

Scope: the CMS 0.11.0 Worker pool/checkpoint change, parallel read facade,
Request-document cache, parsed immutable-plan cache and restoration invalidation.
This is a targeted source/regression review, not a penetration-test certification.

## Corrected finding

The independent render used for a coalesced noncacheable fallback could receive
an already-aborted signal. Generation allocated a work promise before checking
that signal; the wait helper rejected immediately and left the work rejection
unobserved. Depending on the process rejection policy this could terminate the
application during a disconnect race. Generation now checks cancellation before
reserving work or creating the promise. A deterministic public-operation regression
reproduced the unhandled rejection before the fix and passes afterwards.

## Boundaries reviewed

- Domain/application code does not import Worker, VM, Mongoose, HTTP or concrete
  cache adapters. Worker/VM execution, filesystem verification and memory storage
  stay in outbound adapters; composition supplies them.
- Every Worker job gets a fresh realm. Bridge paths use own data properties,
  reject prototype traversal, retain correlation and ignore replies after job
  settlement. Existing code/input/output, bridge-count, memory, queue and deadline
  bounds remain. Edited Snippets remain privileged author-managed code; VM use is
  not a promise of isolation for arbitrary hostile native add-ons.
- Read-only execution rejects CMS/add-on commands before dispatch. Public cache
  eligibility is explicit, frozen with publication and separate from parallelism.
- Cache identities include trusted site and release. Cached plans are detached;
  restored identities clear caches and fence earlier fills. Missing/corrupt plans,
  failed renders and unavailable fallbacks cannot become retained shared output.
- Cookie/Authorization requests bypass shared documents. Unknown bounded public
  query values are omitted before key generation, including arbitrary utm_source,
  repeated navigation metadata and inert prototype-like names. Declared values
  keep their typed validation and key participation. No provider/name allowlist or
  rejection of unfamiliar navigation parameters was introduced.

The retained-plan budget is accounted memory, not a total-process heap ceiling.
Its internal snapshot does not currently provide eviction/oversize alerting.
In-process cache invalidation is not cross-process restoration coordination;
offline maintenance still requires serving processes to be stopped.

Focused checks cover cancellation/admission, Worker isolation, query-only commands,
query normalization, publication verification and cache/restore identities. Test
and installation measurement evidence is retained separately from this document.
