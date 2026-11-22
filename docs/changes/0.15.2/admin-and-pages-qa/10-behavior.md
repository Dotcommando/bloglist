# Scope and acceptance

The owner requests branch `0.15.2` and a thorough review of use cases in
`src/app/use-cases/admin-auth`, `admin-users` and `pages`, including methods of
their adapters. Find/correct QA-test bugs, security vulnerabilities and abstraction
leaks. Remove meaningless or context-obsolete tests only after assessing their
actual guarantees; fewer useful tests are preferred to assertion inventories.

Preserve approved current behavior. Implement fixes using executed failing
regressions and focused real-boundary integration checks, documenting causes and
prevention in `docs/defects/`. Ask the owner if the correct business/error handling
is non-obvious after reading contracts/precedent. No product expansion, deployment,
persistent app startup, unrelated database changes or full-suite run is authorized.

Completion requires a per-operation/adapter coverage assessment, executed relevant
checks, truthful pending limitations and a numbered classified defect-card report.
