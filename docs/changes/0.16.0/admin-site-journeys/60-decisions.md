# Decisions

Owner-approved continuation at f5f09c7: implement all explicitly listed remaining
scenarios, fix observed defects and commit to 0.16.0. Reuse the same dossier.
The redirect picker contract offers PAGE targets only, excluding self/redirects;
prove exclusion and a stale two-editor cycle attempt rather than adding a new
cycle-authoring capability. Existing shared page-cache/Snippet semantics remain
as documented; ADR 0087's future strict guard is outside this test-only scope.
UI-authored Request Snippet execution is verified without enabling page caching;
actual Request cache delivery is verified separately with a composition that has
no Request Snippet invocation.

- Owner selected target 0.16.0 in this conversation; do not bump release metadata
  merely to add tests for that future release.
- Keep existing playwright-core/Vitest stack. Cypress would duplicate tooling.
- Run explicitly before minor releases; no scheduled automation or CI expansion
  was requested. Bounded parallelism applies only to independent isolated files.
- A test-owned ephemeral application is required verification infrastructure,
  distinct from the owner's persistent application, which remains untouched.
- Existing browser suites need current-contract fixture maintenance before becoming
  a release gate. Retain their meaningful guarantees; do not change product behavior
  to satisfy outdated source publication, query, system-document or UI assumptions.
- The dedicated bulk Pagination fixture uses the existing `backgroundWork: false`
  setting. Hooks are outside its scope; ordinary page transactions, hook recording,
  real storage and rendering remain enabled. A background hook pump otherwise
  legitimately conflicts with its rapid setup transactions. This is fixture
  isolation, without automatic mutation retries or a change to runtime concurrency.
- Confirmed TV deep-link, mobile validation focus and file buffer loss are fixed
  within the requested interaction scope, retaining executed RED/GREEN evidence.
- Historical initial selection: default file concurrency was capped at four (or available CPU count if lower).
  The four-worker final selection passed in 119.2s including build. The earlier
  two-worker development selection took 182.59s for tests but still had a fixture
  failure, so it is not a controlled benchmark of the final candidate. Do not
  advertise a universal speedup ratio or scale unboundedly with host CPU count.

Expanded 164-case selection: cap file concurrency at six (or available CPUs if
lower), retaining sequential dependent steps and zero retries. The six-worker
selection passed; four-worker comparison exposed fixture races and was slower.
This supports a bounded local default, not a universal speedup claim.
