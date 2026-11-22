# Reviewing an existing feature

Use this process when asked to review an existing capability against the
[feature lifecycle](feature-lifecycle.md). It defines assessment, not a mandate to
rewrite working code or install historical business capabilities into the CMS.
Resulting behavior changes and fixes follow the normal lifecycle.

## 1. Bound the review

Identify the capability, current source revision, relevant entry points, consumers
and maintained contracts. Read [design](feature-design.md), [testing](testing-policy.md)
and [security](security-verification.md) standards and applicable scoped instructions.
State exclusions, prerequisite dependencies and relevant platforms. Use ADRs for
decision history; do not infer current requirements from superseded proposals.

When selecting a review order, prioritize exposure and consequence: authentication
and authorization, private/public file boundaries, publication/delivery/caches,
snippet/hook/add-on execution, then other data mutations and UI workflows. The
owner's requested scope takes precedence. Review one coherent boundary at a time;
do not start an unrequested full test suite or repository-wide refactor.

## 2. Map guarantees to evidence

Trace each operation from its real inbound route through authorization, application
ports, persistence/effects, delivery and cleanup. Check applicable design rules,
normal/negative/failure/concurrent behavior and the security matrix. Identify
existing tests before proposing more. Assess whether their assertions prove the
guarantee and exercise real composition where required, not just whether files exist.

For a requested maintained audit, write `docs/audits/<review-name>.md` with:

- Date, reviewed revision, scope, contracts and exclusions.
- A guarantee/evidence table, using the states below.
- Reproducible findings, impact/reachability and affected equivalent entry points.
- Selected commands/checks and actual outcomes, separated by evidence method.
- Corrected findings with permanent regressions, plus remaining limitations.

| Evidence state | Meaning |
| --- | --- |
| Verified | The stated guarantee was checked by a suitable executed test or identified review method; state which |
| Failed | A suitable check demonstrates a contract violation or defect |
| Pending | A required check is absent, not run, skipped or blocked by a prerequisite |
| Not applicable | The boundary does not exist within this scope; give the reason |

A source-reviewed guarantee is not an executed integration test. A successful
test run does not prove unrelated rows. Missing evidence is a verification gap;
distinguish it from a reproduced vulnerability. State assessed likelihood/impact
without inventing severity from a test-double-only scenario.

## 3. Execute the applicable checks

Use explicit affected files/name filters and isolated fixtures under testing-policy.md.
Run relevant integration checks before declaring the feature verified; keep
unavailable dependencies/platforms pending. Add missing evidence for important
existing guarantees and execute it. If the check passes before a code change,
record it as added coverage, not a reproduced bug.

For an actual defect, execute a failing regression, correct the behavior within
the agreed contract and rerun the affected checks through feature-lifecycle.md.
Identify related endpoints/consumers that could share the defect. Discuss material
policy changes before implementing them; an audit finding is not authorization
for an unrelated product expansion or deployment.
For confirmed bugs/vulnerabilities, follow the [defect-record procedure](../defects/record-format.md).
Link the bounded audit and regression evidence instead of copying the full report.
Evidence gaps and defense-in-depth scenarios are not confirmed vulnerabilities.

## 4. Close the assessment accurately

Report what was reviewed, reproduced, corrected and executed. The bounded review
can end with explicit pending/failed items; do not call the capability fully
verified until required evidence passes. Keep credentials, installation addresses,
local settings and private operational evidence out of tracked audits.

Maintain audit evidence as a dated assessment. For work that must resume, use the
[feature dossier](feature-lifecycle.md#feature-knowledge-and-resume); link the audit
instead of maintaining a second copy of its findings. Each remediation uses that
lifecycle's state and TDD rules. Update current contracts and changelogs, preserving
historical ADRs and earlier audit facts.
