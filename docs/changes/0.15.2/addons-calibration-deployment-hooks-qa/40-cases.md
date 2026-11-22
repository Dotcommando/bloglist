# Cases and evidence map

All operation names and used adapter methods are mapped in the
[audit](../../../audits/0.15.2-addons-calibration-deployment-hooks.md#operation-evidence).
Exact commands and results are in [verification](50-verification.md).
Every actual fix has executed RED/GREEN; added existing-behavior checks are
characterization, not extra bugs.

| ID | Guarantee / primary evidence |
| --- | --- |
| CAL-STEPS | Missing/empty/foreign/unmeasured positive API evidence cannot win; zero-share control; search units and actual helper/Mongo evidence integration |
| CAL-JOURNAL | Partial ENOSPC preparation leaves allocation intact, retry works, existing journal cannot be overwritten; actual filesystem lease/persistence tests and real workflow restore |
| CAL-ACCESS | Global authority before profile/history/detail/cancel work; failed final-state flush and restoration propagate; profile/run application, adapter and actual profile/workflow evidence |
| HOOK-ORDER | Complete current binding list/version guard under transaction; adapter and real competing-commit regression |
| HOOK-REJECT | Known no-effect receipt remains Failed, safe skip settles lane; unknown effects still block; outcome unit plus real Worker/command/Mongo skip |
| HOOK-ABORT | Supported fatal abort error is preserved with primary, no host replay/commit; driver API inspected, transaction unit, real normal transaction integration |
| HOOK-QUERY | Real Worker result owns pending read completion, late failure and expected cancellation; no message admission after finish or detached termination |
| HOOK-AUTH | All eleven protected operations reject before storage/compiler/effects; requested site/version preserved; actual HTTP admission/core/Mongo composition as scoped in audit |
| HOOK-PLAN | Frozen successful receipts not replayed; fresh plan failure starts no command; application plus real source-atomic command receipt |
| DEPLOY-HEALTH | Moved/absent /admin does not reject healthy backend; real HEAD /api/health, safe 503 and no cookies/provider credential leakage |
| DELIVERY-RELEASE | Marker failure releases operation lock, retains restore exclusion, fresh pass reconciles; actual filesystem plus executor failure/recovery units |
| DEPLOY-STATE | CAS, current exact publication/target, newer demand, uncertain ownership and no blind upload retry; application/provider units and real store/HTTP |
| ADDON-RUNTIME | Provided disposer on invalid created implementation; validation and cleanup errors retained; actual compiled package lifecycle tests |
| ADDON-PRIMARY | Primary plus disposal failure preserved, Pending claim retained, exact-release retry/lost acknowledgement; install application/delivery and real installation |
| ADDON-STAGING | Failed private cleanup remains code-owned and completes before next download; real files/archive with controlled GitHub peer |
| ADDON-PREREQUISITES | Unavailable key does no verification; real private cause retained without false remedy or JSON disclosure; availability/connection units and actual install/update |
| ADDON-UPDATE | Global upload/apply authority, immutable proposal/migrations, pause/drain/repair, connection preservation and continued core serving; admission/gate/runtime units and three real Synthetic updates |
| CATALOGUE-LAYER | Dynamic current registry/unknown-key/selected validator behind outbound port, real optional/clean composition; behavior-preserving placement correction |

The unchanged Linux-only helper socket/UID/GID permission test is inapplicable
to Windows; it remains retained for Linux and excluded from passing counts.
No live provider, full suite or exhaustive platform/fault matrix was authorized.
