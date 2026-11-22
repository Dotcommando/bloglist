# Scenario map

The [audit operation/method tables](../../../audits/0.15.2-admin-auth-users-pages.md#operation-evidence)
are the canonical map for all 22 operations and their adapter boundaries.
[Verification](50-verification.md) holds exact selected commands and actual outcomes.

| Cases | Required proof and actual owning checks |
| --- | --- |
| AUTH | Own-session lifecycle/pagination, bounded failures, account-version fence and failure atomicity: five operation units, failure-atomicity.spec.ts, store/records/password/value/HTTP units; real admin-auth integration |
| USERS | Safe projections, trusted actor, stale/duplicate/last-admin rules, no-op versions and failed staged/hash operations: six operation units plus failure-boundaries.spec.ts; access/store/HTTP units and real user/HTTP integrations |
| PAGES | Eleven operation units preserve identity/content/scope, validate references and reject denied/stale/foreign results; publication-boundaries.spec.ts covers dependency failures and restore bounds |
| DEFAULT-GUARD | Archive/tree adapter unit RED before correction; real page-snapshot-defaults integration RED/GREEN for absent defaults and actual concurrent title edit |
| ASYNC-ERROR | Real repository update unit RED before adding await; duplicate provider rejection maps to domain conflict, uncertain write propagates without retry |
| ADAPTERS | Query/mapping/error/access/registry/hook methods: selected adapter units and actual core, publication, editorial, crawler, hook and restore integrations; see audit method table |
| ADMISSION | 15 real-dispatcher unfinished-body endpoint cases, actual content/user/auth HTTP boundaries; no operation/body/expensive work on relevant denial |
| QA | Retain meaningful reproductions of fixture contract drift, isolation, provider overrides and sibling Promise handling; remove only self-test/invented-token/declaration inventories |
| ARCH | Explicit architecture and real composition/forbidden-authority tests; source trace of all operation imports and port contracts |

Meaningful failure checks added to already-correct behavior are characterization,
not fabricated RED/GREEN. Fake transaction tests prove orchestration only; real
MongoDB cases prove selected persistence/concurrency boundaries. Rewriting media
references is covered at its actual application boundary and shared real guarded
repository boundary; no new live media service or artificial duplicate end-to-end
fixture was required. Admin UI/Safari, dependency advisory scanning and unrelated
worker processes have no changed boundary in this task.
