# Parsed Request-plan cache

Implemented in CMS 0.11.0 under ADR 0063. This adapter cache retains decoded and
verified `IStoredRequestPlan` values. It does not compile template ASTs, cache
Request-loader results, select the active release or replace the HTML cache.

## Identity and verification

The key is the tuple `(siteId, selected releaseId, planId)`. The first load keeps
the existing Ready-release, manifest, checksum, envelope, identity, rendering and
asset-reference checks. Missing or failed loads are never retained. Each caller
receives a structured clone, including independent Date objects.

Published release artifacts are immutable. Subsequent hits reuse this verified
snapshot without rereading its files or release record. Public requests still
resolve the trusted site and currently selected release and enforce their normal
input, access and add-on checks. Direct edits to activated release files are not
a supported publication operation; deliberate replacement requires maintenance
invalidation or stopping every serving process.

CMS 0.12.0 retains a SHA-256 content fingerprint with each admitted plan (ADR
0071). It covers the verified site/release/decoded plan/assets before the
fingerprint field is added. Document keys still include normalized typed values,
path, language and representation. Legacy outbound implementations without the
optional field use the existing digest fallback.

New plans optionally include exact inline-style content/hash pairs and prepared
page Markdown (ADRs 0072–0073). Legacy plans remain readable and use runtime
processing. Final HTML minification remains dynamic; CSP hashes match the exact
emitted CSS bytes, including dynamic styles. Page Markdown is reused only for
the same source/trust classification; route-dependent and Request-dependent
Markdown stays dynamic. Rebased releases recompute prepared style metadata.

## Lifetime and bounds

Each content adapter retains at most 128 plans with a 32 MiB accounting budget.
Accounting uses four bytes per serialized UTF-16 code unit plus key/entry overhead;
this bounds cache admission, not total JavaScript heap usage. Least-recently-used
entries are evicted. An oversized plan is still returned after verification but
not retained. Up to 128 identical-load groups share in-flight work; overflow loads
proceed normally. Pending groups are removed on settlement. There is no TTL for
immutable plans. Shutdown clears the cache and stops further admission.

## Publication and restoration

- Publishing one page creates a new release, rebuilding that page and reusing the
  other published pages. Reused plans are qualified for the new release. Neither
  they nor the changed page can collide with entries from the old release.
- Publishing the whole site also creates a new release from published versions.
  Draft saves alone never change a public plan. Existing in-flight requests keep
  their selected release; retained releases have separate entries.
- Dump maintenance purges both parsed plans and rendered documents before the
  operation and in its `finally` cleanup, including failures. A generation fence
  prevents an older pending read from repopulating the cache after either purge.
  Restore therefore remains correct even when a restored release has an identity
  already encountered in the same process.
- Caches are local to one composition/process. Offline restore/update procedures
  must stop all serving processes; there is no cross-process invalidation claim.

The rendered-document TTL remains independent. An expired HTML document is built
again using current Request data and a retained immutable plan when available.
The first request after process start or plan eviction pays the verification and
decoding cost again.

## Verification

Adapter tests cover isolation, detached Dates, coalescing, failure retry, bounded
retention and late reads across purge/shutdown. The isolated composition test
warms both caches, publishes one page, publishes the site, reads retained releases
and restores an earlier dump in the same process. It checks published output,
draft separation, frozen Build values and cache invalidation after restoration.
