# Decisions

- Owner: commit previous work, continue this review in exact branch/target 0.15.2.
- Owner: apply existing-feature-review, substantive tests, remove proven junk,
  correct business logic/abstraction leaks and fully reason through recovery.
- Preserve current approved contracts; a genuine unresolved material policy is a
  question for the owner after technical investigation, not an invented fallback.
- No agent delegation requested/authorized. No full suite or deployment authorized.
- Record current QA/regressions selectively; do not reread all defect history.

- Installation's existing ten-second deadline covers local key acquisition and
  remote proof together. A timeout prevents late network work; the losing key
  Promise remains observed. Expected candidate failure and technical local
  failure stay distinct.
- Media fencing runs a neutral async predicate under the existing writer lock;
  return false skips stale output/garbage/acknowledgement. No ODM/path/session
  type crosses the port. Offline migration applies the same captured-version
  check and retains its stop-writers/retry contract.
- Code owns failed stage/listener/stream work. Preserve primary and cleanup
  failures and durable recovery state; do not invent user/operator JS-object
  workarounds or silently replay uncertain database writes.
- Preserve approved private-unreferenced-asset and media source-repair retry
  outcomes. Do not invent new product garbage collection or transactional scope.
- Local Cloudflare preparation is streamed and verified; no external upload/API,
  persistent app start, version bump, tag, push or deployment is part of this work.
