# Decisions

| Decision | Status and basis |
| --- | --- |
| Persist separated feature knowledge and a visible resume stage | Accepted: the owner's current request explicitly asks for Markdown artifacts and stage visibility |
| Use backend TDD and exclude barrel-export/enum-value test inventories | Accepted: explicitly requested by the owner |
| Require relevant integration checks before feature completion | Accepted in the preceding owner request; preserve it |
| Group features/fixes under `docs/changes/<version>/<slug>/` | Accepted: the owner's follow-up explicitly requires an agreed target release |
| Use the neutral `docs/changes/` root for all change kinds | Owner requested removing the feature-specific root name; `changes` is the implementation choice |
| Use `docs/changes/unversioned/<doc-slug>/` only for documentation-only work | Owner permits unversioned documentation; the explicit namespace is an implementation choice |
| Keep stable topic names and one stage/step marker within each dossier | Implementation choice within the requested scope; stable links and separate concurrent features |
| Keep naming/resume policy in lifecycle and testing rules in testing policy | Implementation choice to preserve a single owner for each standard |
| Seed the current documentation change as a real dossier | Implementation choice that makes the convention inspectable and resumable without fake product work |
| Do not invent backend TDD evidence for this Markdown-only change | Apply the documentation-only verification path |
| Expand test exclusions with concrete examples and meaningful alternatives | Accepted: the owner's latest request; illustrative snippets do not introduce CMS APIs or mandate all examples as tests |
| Define explicit user/operator error outcomes and ask the owner when non-obvious | Accepted: the owner's current error-handling requirements |
| Require regression tests and prevention documentation for confirmed bugs/vulnerabilities | Accepted: explicitly requested by the owner |
| Use `docs/defects/` with compact routing/area indexes and individual canonical records | Implementation choice to load only relevant defect knowledge, separately from versioned remediation work |
| Seed two historical bug records from the shutdown audit without rerunning runtime tests | Documentation-only import with explicit provenance and incomplete catalog coverage |
| Audit all repository AGENTS.md files and remove duplicated central standards | Accepted: the owner's current request to reduce development context |
| Use a single lifecycle route and stage/scope sections rather than mandatory whole-document loading | Implementation choice within that request; all applicable obligations remain mandatory |
| Retain unique scoped rules; replace duplicated admin contract excerpts with their existing owning links | Preserve product behavior while avoiding both central and scoped duplication |
| Report discovered-defect counts and a numbered list of created cards with bug/vulnerability labels | Accepted: the owner's latest request; lifecycle owns the format |
| Separate newly discovered defects from known/historical records and track counts across the agreed scope | Implementation choice to avoid double counting, lost resumed findings and misleading historical imports |

Open material policy questions: none identified. Source/runtime checks remain
outside this change's verification scope.
