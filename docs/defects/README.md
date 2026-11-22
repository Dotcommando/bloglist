# Defect lookup

This is a routing index for confirmed bugs/vulnerabilities, not a combined incident
history. Read it before designing changed behavior, then load only relevant records.
Use [record-format.md](record-format.md) when adding/updating a record; it is not
required reading for every feature. Contracts remain the source of current behavior.

## Selective reading

1. Identify the affected capabilities, entry points and failure mechanisms from the
   feature scope. Match the triggers below, including cross-cutting boundaries.
2. Open only matching area indexes. Use their one-line summaries and tags to select
   individual records; follow test/contract/audit links only when needed for the work.
3. Save selected record links, applicable guarantees and a brief reason for excluding
   a plausible match in the feature's `20-existing-behavior.md`. Map required cases
   into `40-cases.md`. On resume start from these selected links and check whether
   the affected area index has changed; do not reload every historical dossier.
4. If no index matches, search documentation by capability and failure keywords
   (for example with `rg`), then read the matching records/audit sections. Missing
   catalog coverage is not evidence that an area has no previous defects. Expand
   the search only when a concrete finding crosses another boundary.

| Area index | Read when changing |
| --- | --- |
| [Administration](admin/README.md) | Editor partial-save/URL reconciliation, header/popover interaction, keyboard/focus, version details and browser dismissal |
| [Runtime](runtime/README.md) | Async dispatch, HTTP request lifetime, admissions, disconnect/cancellation, worker drain/shutdown, site/admin process pools |
| [Composition](composition/README.md) | Optional provider graphs, public-only/admin composition, startup/token resolution and capability dependencies |
| [Pages](pages/README.md) | Page snapshot/default guards, archive/move, repository saves and provider-error translation |
| [Installation](installation/README.md) | Administration-address verification, global settings/key storage and dependency versus candidate-error classification |
| [Calibration](calibration/README.md) | Calibration scenario metrics, owned positive step evidence, recommendation eligibility and restoration |
| [Hooks](hooks/README.md) | Atomic handler/subscription configuration, command outcomes/receipts, delivery lanes and safe recovery |
| [Add-ons](addons/README.md) | Runtime validation/disposal, repository installation claims and private staging/error ownership |
| [Deployment](deployment/README.md) | Executor backend health, provider outcomes and delivery/restore permit cleanup/reconciliation |
| [Media](media/README.md) | Pending media journals, projection version fencing, owned stage/lock failure cleanup and reconciliation |
| [Publication](publication/README.md) | Immutable release staging, preview startup, frontend asset work, static export/Cloudflare preparation and temporary output lifetime |
| [QA](qa/README.md) | Auth admission/counter fixtures, system-document setup, publication metadata/paths, isolated storage, async HTTP tests and composition overrides |

The catalog includes two sourced historical bugs and the bounded 0.15.2 reviews
of auth/users/pages, installation/JSON-LD/media/publication and add-ons/calibration/deployment/hooks. Other audits
have not been comprehensively indexed. Add area routes when confirmed records are created;
do not load all audits to compensate. This catalog is not a vulnerability inventory
or a claim of whole-product verification.
