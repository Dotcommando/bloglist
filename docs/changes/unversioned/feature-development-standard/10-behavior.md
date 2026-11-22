# Agreed behavior

The owner requested resumable Markdown knowledge for each feature, separating
affected existing functionality, corner cases and other findings. The folder or
file names must expose the stage where work stopped. The same request requires
backend TDD and substantive unit/integration tests, explicitly excluding barrel
export and enum-value tests that only demonstrate that declarations exist.
The owner subsequently required grouping features/fixes by target release, with
unversioned work permitted only for documentation changes such as this task.
The owner also requested a neutral root name because this knowledge includes bugs
as well as features; the chosen directory is `docs/changes/`.
The latest request adds concrete examples of tests without substantive proof to
the testing policy's exclusion section, with useful behavioral alternatives.
The owner now requires explicit user/operator error outcomes, safe paths out of
failure and questions to the owner whenever the right handling is non-obvious.
Confirmed bugs/vulnerabilities also need permanent regressions and discoverable
prevention records loaded selectively for the affected new work.
The current request audits all repository AGENTS.md files for duplication with
the development standards and reduces mandatory context without weakening rules.
The latest request requires completion reports to count discovered defects and
provide a numbered list of created cards, explicitly identifying each as a bug
or vulnerability.

## Acceptance

- A new agent can find a stable dossier, identify its stage/TDD step from one
  filename and recover the exact next action and last confirmed result.
- Behavior, affected existing guarantees, design, scenarios, results and decisions
  have distinct homes with links to authoritative contracts.
- Backend behavior uses executed RED/GREEN/REFACTOR checks and suitable test levels.
- The test policy explains which unit and integration scenarios prove real
  guarantees, and excludes declaration-only tests.
- Root instructions route agents to the convention; old prohibitions on these
  artifacts do not conflict with the owner's current request.
- Features/fixes live under their agreed target version; only documentation-only
  dossiers can use `unversioned`. Moving a release target preserves one dossier.

## Exclusions

No application behavior changes, test runner changes, migration of every existing
feature to a dossier, historical TDD reconstruction or runtime test execution.
This dossier covers the current extension of the preceding standards work.
