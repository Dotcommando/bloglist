# Feature development lifecycle

This is the mandatory workflow for new features, behavior changes and bug fixes.
It also governs remediation from an [existing-feature review](existing-feature-review.md).
Start here before implementation; follow scoped AGENTS.md and the owning maintained
contracts for the affected boundaries. The owner's agreed behavior defines scope.

## Document ownership and reading route

Start with this route and the current lifecycle stage, not every linked document.
Read applicable sections before the decisions/changes they govern; links are
navigation, not instructions to load whole files. Requirements remain mandatory
where applicable. Expand the reading set when the actual scope expands.
For add-on work, also follow the applicable [add-on development standards](../addon-development/README.md).

| Document | Owns | When to read |
| --- | --- | --- |
| [Feature design](feature-design.md) | General design and implementation rules | Before designing or changing source behavior |
| [Testing policy](testing-policy.md) | Test selection, execution and evidence | Before implementation and final verification |
| [Security verification](security-verification.md) | Threat assessment, security controls and security regressions | Before implementation; apply the relevant boundaries |
| [Existing-feature review](existing-feature-review.md) | Retrospective assessment and audit evidence | When reviewing an existing capability |

For documentation-only work, read `docs/AGENTS.md`, the standards actually being
edited, dossier/completion rules as needed and the
[documentation checks](testing-policy.md#source-checks-and-documentation-only-work).
Do not load backend design, runtime security checks or the test-example catalog
merely because they are linked from this workflow.

For source behavior, select the affected design sections and testing levels;
backend changes require the TDD/unit/integration rules before implementation.
Read the security boundary assessment and applicable controls even for an
application-only change when it affects admission, authority or file/stream safety.
Admin/browser and packaging work add their scoped instructions and relevant
verification sections. Read detailed test examples when selecting/reviewing tests
needs clarification, rather than on every unrelated task.

These documents own general development standards. Scoped AGENTS.md files own
local conventions and route to capability contracts in `../arch/`; ADRs explain
decisions and audits record bounded evidence. Link to the owner instead of copying
its requirements. A historical scenario or proposal does not authorize a capability.

Resolve routine choices independently. Existing approved contracts require no
repeated approval; agree material behavior, contract or policy changes with the
owner before implementing them. Keep the design and verification notes in the
[feature knowledge directory](#feature-knowledge-and-resume) rather than relying
on conversation memory. Maintained contracts, ADRs and requested audits retain
their own roles; a feature dossier links to them instead of replacing them.

## Feature knowledge and resume

The neutral `changes/` namespace holds features, fixes and documentation work.
Create `docs/changes/<version>/<feature-slug>/` for a feature or behavior change,
and `docs/changes/<version>/<bug-slug>/` for a bug fix. `<version>` is the agreed
target CMS release in plain `MAJOR.MINOR.PATCH` form, without a `v` prefix. It
identifies the release receiving the work, not necessarily the version currently
in package.json. Resolve it from the owner's request or established release
context. If it is unknown, clarify it before source implementation while continuing
independent discovery; do not invent a next version or use an unversioned source
change. A release directory groups the features/fixes intended for that release;
their state markers distinguish completed work from pending work.

Only documentation-only work without a target release may use
`docs/changes/unversioned/<doc-slug>/`. Documentation accompanying a versioned
feature/fix stays in that feature's dossier. If an unversioned task expands to
source behavior, agree its target version and relocate its dossier before that
implementation. When the owner changes a target release, relocate the dossier
and update its version context and links; do not keep competing copies.

Use a short, stable, unique lowercase kebab-case slug within its release directory;
reuse the same dossier on continuation. The directory is tracked in Git and
contains reviewable engineering knowledge, including unfinished work. Never put
credentials, private installation settings or raw sensitive test output here.

Keep the directory name stable so links survive stage changes. Its single state
file exposes the current stage and work step in directory listings:

```text
docs/changes/<version>/<feature-or-bug-slug>/
  00-state--04-implement--red.md
  10-behavior.md
  20-existing-behavior.md
  30-design.md
  40-cases.md
  50-verification.md
  60-decisions.md
```

| Artifact | Contents |
| --- | --- |
| `00-state--<stage>--<step>.md` | Kind (feature, bug or documentation), target release (or documentation-only unversioned), current objective, branch and baseline revision, relevant uncommitted work, last confirmed result, exact next action/test, blockers and links to the other artifacts |
| `10-behavior.md` | Actor/scope, agreed inputs/results/failures, acceptance examples, exclusions and unresolved behavior questions |
| `20-existing-behavior.md` | Affected existing operations/consumers, current guarantees, source/contract/test references and behavior to preserve |
| `30-design.md` | Proposed boundaries, ports, data/state changes, atomicity, recovery, resources and links to owning contracts/ADRs |
| `40-cases.md` | Normal, edge, negative, failure, concurrency and security scenarios with stable IDs, expected results/effects, selected test level/file and justified omissions |
| `50-verification.md` | Executed RED/GREEN/refactor checks and final checks: command/test, observed outcome, checked revision or working-tree context, pending checks and prerequisites |
| `60-decisions.md` | Decisions with reasons and approval source where needed; distinguish accepted decisions, proposals, assumptions and open questions |

Create the state and behavior files immediately. Populate the other artifacts as
their evidence becomes available, before leaving the corresponding stage; do not
create empty filler or an inventory of unrelated tasks. Small changes can use
short files, and inapplicable sections need only a reason. State links point to
existing files; create an artifact before linking to it.

### Stage and step names

| Stage | Meaning | Allowed steps |
| --- | --- | --- |
| `01-scope` | Define the behavior and affected existing functionality | `active`, `blocked` |
| `02-design` | Design boundaries and assess threats | `active`, `blocked` |
| `03-test-design` | Select observable scenarios and suitable tests | `active`, `blocked` |
| `04-implement` | Implement one behavior through TDD | `red`, `green`, `refactor`, `blocked`; `active` only for work outside backend behavior |
| `05-verify` | Execute remaining integration, security, browser and source/documentation checks | `active`, `blocked` |
| `06-complete` | All required checks pass and documentation/evidence is current | `done` |

The filename names the work currently in progress, not a claim that its checks
passed. For example, `--red` means to write/run a failing behavior test; after
observing the intended failure, record it and rename the marker to `--green`
before implementation. `--green` means to implement enough to pass; `--refactor`
means to improve the passing implementation while retaining behavior. A blocker
uses `--blocked` at the current stage; record the interrupted TDD step inside.
Do not mark a whole feature complete because one TDD cycle is green.

Rename the state file when the stage/step changes, keeping exactly one such file
per dossier. Update knowledge after a material discovery/decision, each observed
TDD result, verification batch and before a handoff or interruption. Record facts
as confirmed only with a source or executed check; explicitly label uncertainty.
Do not copy entire contracts, source files or logs into the dossier.

### Resuming work

Locate the dossier by target release and feature/bug slug (or the unversioned
documentation namespace). Read its state and agreed behavior first, then the
topical sections/evidence needed for the recorded next action. Do not reload every
completed verification entry or unrelated decision. Restore applicable scoped
instructions and standard sections through the reading route before source work.
Compare the recorded branch/revision and relevant working-tree changes with Git;
evidence from a different tree is historical until its applicability is checked.
Do not discard newer owner edits or rerun unrelated checks automatically.

Reconcile artifacts with actual source/tests and results before executing the next
action. If an interrupted write left no marker, multiple markers or stale evidence,
reconstruct the state from the available facts and explain the uncertainty. Never
invent a previous RED execution. Missing prerequisites stay explicit. Keep the
completed dossier and its `00-state--06-complete--done.md` marker as bounded history;
subsequent work rechecks current contracts instead of treating old notes as policy.

## 1. Define observable behavior

Identify the initiating actor, trusted scope, accepted inputs, results, failures
and affected existing scenarios. State acceptance examples and explicit exclusions.
For a bug, describe the observable defect and the expected behavior. Read relevant
child instructions, contracts, ADRs and fixtures before choosing an implementation.

Outcome: the behavior to deliver and preserve is clear enough to test. An
unresolved material policy decision remains a question, not an invented default.
Save the agreed behavior in `10-behavior.md` and affected guarantees/references in
`20-existing-behavior.md` before moving to design.
Use the [defect lookup route](../defects/README.md) for the affected areas and
failure mechanisms; save only relevant record links and applicable lessons in
`20-existing-behavior.md`. Do not load all past defects or all change dossiers.

## 2. Design the change and assess threats

Apply feature-design.md to the affected boundaries. Identify data ownership,
invariants, ports, state transitions and failure/recovery semantics. Select the
applicable security-verification.md checks from the actor and data flow, including
indirect entry points and equivalent operations in other endpoint families.

Outcome: the implementation fits the current contracts, or an explicit contract
change has been agreed. Record deliberate architecture changes in `../adr/` and
maintain current behavior in the owning `../arch/` contract.
Save the design in `30-design.md` and decisions/questions in `60-decisions.md`.
Apply [error outcomes and recovery](feature-design.md#error-outcomes-and-recovery).
If the outcome or safe user path is unclear, ask the owner before deciding it.

## 3. Select verification before implementation

Map acceptance examples, preserved guarantees and applicable threats to concrete
test files and levels using testing-policy.md. Explain significant omissions or
inapplicable categories. Identify required isolated dependencies and platform
checks early. A coverage percentage alone is not a verification strategy.

Outcome: each material guarantee has an observable check at the boundary that can
prove it; missing prerequisites are known before completion is claimed.
Save the scenario-to-test mapping and relevant corner cases in `40-cases.md`.

## 4. Implement one observable use case at a time

Follow the test-first application/adapter sequence and regression requirements in
[testing policy](testing-policy.md#select-the-level-that-proves-the-guarantee),
then implement the approved behavior. Do not add unrelated workflows to fill a port.
For backend behavior, use its [RED/GREEN/REFACTOR cycle](testing-policy.md#backend-tdd-cycle)
and expose the current step through the state filename.

Register the use case in AppModule or an imported capability module through its
inbound token, constructor dependencies and composition factories. Verify provider
resolution using overrides, then bind real adapters and verify actual composition.
Reuse verified adapters. Add/update focused integration coverage alongside the
behavior under testing-policy.md, rather than deferring it to a separate project.

## 5. Execute focused verification

Run the selected tests, applicable security checks and source checks defined by
testing-policy.md, including the [integration completion requirement](testing-policy.md#required-scenario-selection).
If a required check cannot run, report its prerequisite and leave verification
pending under that policy's evidence rules.
Record executed checks and pending prerequisites in `50-verification.md`.

Resolve diagnostics and reproducible regressions within the agreed scope. Evaluate
related entry points for the same defect. Use the repository's application and
dependency operating restrictions in the root AGENTS.md during verification.

## 6. Complete with evidence

A feature is complete when its agreed behavior is implemented through the required
entry points and composition, its relevant checks have passed, and its maintained
contracts/documentation are consistent. Follow [documentation maintenance](../AGENTS.md)
for placement, changelogs and language requirements.
For confirmed bugs/vulnerabilities, complete the regression and prevention
documentation through the [defect-record procedure](../defects/record-format.md).
This includes the relevant area-index entries and current owning contract changes.

Report the actual change, selected checks/commands, outcomes and remaining
limitations. Separate automated tests, manual/browser checks and source inspection.
Do not label a feature fully verified while required checks are pending or failing.
A local build proves no deployment; release and deployment follow their own scope.
Update the dossier and rename its state to `00-state--06-complete--done.md` only
after these completion conditions hold.

### Defect summary in the completion report

Every feature/fix completion report states the number of distinct confirmed
defects discovered within the agreed work scope: total, bugs and vulnerabilities.
Include defects found in existing code and those caught/fixed during development,
not just unresolved findings. Count each canonical defect once, using its record's
kind; do not count a vulnerability again as a bug. Missing requested behavior in
a normal TDD RED step, unconfirmed concerns and expected business rejections are
not confirmed defects.

Also state how many `docs/defects/` cards were created within that scope and give
a numbered list of all of them. Each item includes a clickable card link, explicit
kind (bug or vulnerability), a short explanation of the defect and its actual
status (fixed, open or verification pending). Use the user's language for labels.
Do not substitute a folder link or an unclassified list of filenames.

Maintain the scope's inventory in `50-verification.md`: canonical ID/link, kind,
newly discovered versus previously known/historical, card created versus reused/
updated, status and regression evidence. Use this inventory across resumptions;
do not scan/load the entire defect catalog or report only the last turn's findings.
Previously known rediscoveries are reported separately, and historical card imports
are labeled as such rather than counted as newly discovered defects. Explain any
difference between discovery and card-creation counts; reuse canonical records.

When no defects were confirmed, explicitly report zero; when no cards were
created, explicitly say so without inventing list items. Zero means none found
within the stated checks/scope, not a claim that the CMS has no vulnerabilities.
Pending checks or missing required cards remain visible and cannot be hidden
behind a zero count or a completed-feature claim.

## Proportionate paths

- Documentation-only work uses the [documentation checks](testing-policy.md#source-checks-and-documentation-only-work).
- A visual-only change applies the design and browser checks relevant to its
  observable effect; it need not invent a backend use case or integration test.
- A bug fix uses the same applicable stages, starting with its reproduction.
- A retrospective review follows existing-feature-review.md; each resulting fix
  returns to this lifecycle.
