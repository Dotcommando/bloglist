# Verification evidence

## Context

Date: 2026-11-18.

Baseline: `87f7d703c2507912a1431ba8a0b4352986c597c4`, branch `master`, with the
preceding conversation's uncommitted Markdown standards extraction. Checks below
must identify actual working-tree results rather than claiming a committed build.

## Executed

- Read current root/documentation instructions, lifecycle, design, testing and
  existing-feature-review standards.
- Searched for conflicting no-status/no-tracking rules; identified the lifecycle,
  testing policy and review document as the current owners needing correction.
- Confirmed the baseline/branch with `git rev-parse HEAD` and
  `git branch --show-current`.
- DOC-01 through DOC-06: documentation review confirmed the single-marker resume
  convention, separate knowledge artifacts, backend RED/GREEN/REFACTOR evidence,
  substantive unit/integration selection and explicit declaration-test exclusions.
  Required relevant integrations still gate feature completion.
- DOC-07: after the version-layout change and dossier relocation, an inline Node
  checker passed for 30 changed Markdown files: 259 relative links and 23 anchors.
  It checked 213 repository Markdown files (672 relative links, 27 anchors) against
  HEAD and found no introduced broken references, including inbound links.
- DOC-08: changed-file trailing-whitespace, final-newline and fenced-block checks
  passed; `git diff --check` passed.
- DOC-09: `rg` found no current no-tracking prohibitions or remaining old flat
  feature-directory patterns in the edited standards/instructions/dossier/changelogs.
  The no-match exit code is the expected search outcome.
- DOC-10: reviewed explicit target-release selection, documentation-only unversioned
  scope, release relocation and unknown-version handling. A filesystem validator
  found one dossier under `unversioned`, with exactly one valid stage/step marker.
  package.json currently says `0.15.1`; no future release was inferred from it.
- DOC-11: after the neutral-root relocation, the inline Node validator again
  passed for 30 changed Markdown files (259 relative links, 23 anchors), with no
  introduced broken references across 213 repository Markdown files. No obsolete
  root references remain, the previous directory is absent and this dossier has
  one state marker. Whitespace/newline/fence checks and `git diff --check` passed.
- DOC-12: reviewed 15 illustrative low-value tests, each with its missing guarantee
  and a meaningful alternative. The examples preserve useful boundary, architecture
  and compatibility checks rather than excluding assertion styles categorically.
  A fresh inline Node check passed for 30 changed Markdown files, 259 relative
  links, 23 anchors, example-table columns, whitespace, final newlines and fences;
  `git diff --check` passed. No runtime tests were needed for this addition.
- DOC-13: reviewed the four error-design questions, explicit owner escalation when
  the answer is unclear, safe user/operator outcomes, business rejection versus
  cancellation/technical failure and observable recovery-path checks.
- DOC-14: reviewed bounded root-to-area-to-record lookup, saved selected dossier
  links, cross-area canonical references, fallback search and index splitting.
  Each initial area index has one record; no whole-catalog loading is required.
- DOC-15: checked record metadata, regression/prevention requirements and both
  historical imports against the original shutdown audit. Links to the existing
  regression files resolve; their actual tests were not rerun and exact test-title
  filters are explicitly not claimed known. No vulnerability is invented from
  these historical functional/composition bugs.
- After these additions, the inline Node validator passed for 36 changed Markdown
  files (295 relative links, 31 anchors), with no introduced broken references
  across 219 repository Markdown files. Whitespace/newlines/fences and
  `git diff --check` passed; the dossier retains a single state marker.
- DOC-16: reviewed all 12 repository AGENTS.md files against the five development
  standards and relevant maintained contracts. Before/after measurements use the
  working-tree snapshot at the start of this request, not HEAD (which lacks the
  preceding uncommitted standards work). Totals changed from 490 to 419 lines,
  3,716 to 3,192 whitespace-delimited words and 29,646 to 24,779 UTF-8 bytes.
  These are document-size measurements, not claims about model token usage.

| Instruction scope | Lines before/after | Disposition |
| --- | --- | --- |
| Root | 70 / 54 | One lifecycle route; keep product, tools, Git and app operating scope |
| `.github` | 5 / 3 | Route to scripts owner; remove copied generic pinning/credential and release rules |
| `ops` | 5 / 5 | Retain unique operating/resource constraints |
| `scripts` | 64 / 64 | Retain release/import/permission/install guarantees and explicit installer prohibition; target source-convention pins |
| `docs` | 31 / 23 | Retain documentation integrity/language/placement; link dossier/defect procedures |
| `src` | 30 / 14 | Remove central-standard restatement and publication excerpts already owned by linked contracts |
| `src/app/use-cases` | 9 / 4 | Single workflow pointer instead of repeated four-document reading route |
| Persistence | 29 / 26 | Preserve database-specific shapes, ownership, precision and transaction/index rules; use central UTC/input/mutation rules and migration owner |
| Rendering | 33 / 30 | Preserve engine-specific rules; central output controls and production-output verification |
| `migrations` | 13 / 13 | Retain unique immutable checksum/packaging and rollout guarantees |
| `admin` | 16 / 11 | Preserve controls/CSS details; move workspace/lockfile rule to the owning design section |
| `admin/src` | 185 / 172 | Preserve unique interaction rules; use existing add-on/text-action contracts; move the unique no-shift text-hover detail into its owning contract |

- DOC-17: reviewed the single root route, scope/stage section selection and focused
  dossier resume. Backend TDD, integration-before-completion, applicable security,
  owner questions for unclear errors and defect prevention remain mandatory.
  Documentation-only changes no longer demand reading every runtime standard;
  relevant source scope expansion still expands the reading set.
- A normalized 14-consecutive-word comparison found no copied prose windows
  between AGENTS.md files and development standards. This supplements the manual
  ownership review above and does not prove semantic uniqueness on its own.
- After deduplication, local checks passed for 38 changed Markdown files (291
  relative links, 32 anchors), with no introduced broken references across 219
  repository Markdown files. Whitespace/newline/fence checks and `git diff --check`
  passed. No application suites/build were run for this documentation-only work.

- DOC-18: reviewed the mandatory discovered-defect totals, per-kind counts,
  numbered created-card links/explanations/statuses, zero cases and inventory
  across resumptions. Existing/historical records remain distinct from new
  discoveries. The standards-work inventory below reconciles zero new findings
  with two earlier historical card imports.
- After the reporting changes, checks passed for 38 changed Markdown files,
  295 relative links, 34 anchors, whitespace/final-newline/fence checks and
  `git diff --check`. Runtime tests remain inapplicable to this documentation change.

## Defect inventory for the agreed standards work

Newly discovered confirmed defects: 0 (bugs: 0, vulnerabilities: 0). This work
changes documentation and does not claim runtime/security verification.
Created cards: 2 historical imports from the existing shutdown audit, not new
discoveries. The completion-report follow-up itself creates no additional cards.

| Canonical record | Kind | Origin/card operation | Status and evidence |
| --- | --- | --- | --- |
| [runtime/disconnected-dispatch-admission](../../../defects/runtime/disconnected-dispatch-admission.md) | Bug | Previously known; historical card created during the standards work | Fixed according to the linked historical audit/regressions; not rerun here |
| [composition/public-only-calibration](../../../defects/composition/public-only-calibration.md) | Bug | Previously known; historical card created during the standards work | Fixed according to the linked historical audit/regression; not rerun here |

## Remaining prerequisites

None for this bounded documentation change.

## Not applicable

Backend RED/GREEN/refactor, application unit/integration tests, browser checks,
build and deployment: no source/runtime behavior changes in this work. They were
not executed and are not claimed passing.
