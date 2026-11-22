# Design

Use a tracked `docs/changes/<version>/<feature-or-bug-slug>/` directory for each
feature/fix, where version is the agreed target release. Documentation-only work
without a release uses `docs/changes/unversioned/<doc-slug>/`, as this dossier does.
Read the version from agreed context rather than assuming current package metadata
is the next release. Relocate the dossier if the target release changes. Put
the current stage/work step in exactly one `00-state--<stage>--<step>.md` filename.
Rename this file on transitions, preserving the directory and topical filenames.
The lifecycle owns naming, stage values, artifact contents and recovery behavior.

The state records Git context, last confirmed result, next action and blockers.
Topical artifacts preserve engineering facts and references, not copied contracts
or private logs. Keep completed dossiers as dated evidence. On resume reconcile
the checkpoint with actual source/tests/Git before acting.

The testing policy owns RED/GREEN/REFACTOR and test selection. Domain/application/
adapter unit tests establish behavioral decisions; real-boundary integration
tests establish composition, storage, protocol and process guarantees. A pure
composition defect uses a meaningful failing boundary regression rather than an
invented unit test. Declaration-only changes use relevant compiler/architecture
checks unless their consumers' runtime behavior changes.

This changes the development process only. It adds no application ports, database
collections, transports, dependencies or runtime configuration; no product
architecture ADR is needed.

Error design stays in feature-design.md: explicit observer/outcome, safe recovery,
business-case alternatives and comparable precedent, with owner questions when
unclear. Testing policy proves that behavior at the appropriate boundary.

`docs/defects/README.md` routes by affected mechanism to small area indexes, then
individual canonical records. `record-format.md` owns record/maintenance rules and
is loaded when writing a record, not as mandatory context for every feature.
Per-feature artifacts retain selected links and applicability, avoiding full
historical logs or copied policies. Existing audits remain original evidence.

Instruction deduplication uses one root lifecycle route. Scoped instructions keep
local requirements and owning-contract links. The lifecycle selects sections by
stage/scope; resuming reads the state/behavior and evidence needed for the next
action instead of replaying the complete dossier. Reading less does not waive
applicable TDD, integration, security or error/defect-handling obligations.
