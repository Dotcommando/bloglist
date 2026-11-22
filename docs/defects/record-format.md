# Recording a confirmed defect

Create/update a record for every confirmed behavior bug or security vulnerability
when reproducing and correcting it. Use the [feature lifecycle](../cms-development/feature-lifecycle.md)
for implementation, [testing policy](../cms-development/testing-policy.md#regression-and-prevention-after-a-defect)
for executed regressions and [lookup route](README.md) for selective reading.
Editorial documentation changes do not require a fictional runtime defect.

## Location and classification

Keep one canonical `docs/defects/<owning-area>/<defect-slug>.md` per defect, with a
stable descriptive slug. Release versions belong in its metadata, not its path:
one mechanism can affect several releases. Remediation work still belongs in
`docs/changes/<target-version>/<bug-slug>/`; link that dossier rather than copying
its full history. Use the relevant area index as the entry point to this record.

Classify the record as a confirmed bug or confirmed vulnerability. Distinguish
demonstrated impact/reachability from suspected security implications, review gaps
and defense-in-depth tests. An unconfirmed concern remains in the review/dossier
until evidence establishes it; do not invent an exploit, severity or affected range.

Record status as open, fixed or verification pending. A pending required regression
prevents claiming the defect fully verified. A confirmed open finding can be
recorded before a fix; keep its missing evidence and remediation explicit.

## Required contents

Keep records short enough to read individually; link detailed evidence. Include:

- Stable ID (`<area>/<slug>`), kind, status, discovery/record date when known,
  affected and fixed versions/revisions with evidence, or explicitly unknown.
- Applicable capabilities, entry points, failure-mechanism tags and concrete
  triggers telling a future agent when to read this record.
- Observed symptom/impact and safe deterministic reproduction preconditions.
  Separate the original defect from hypothetical related scenarios.
- Root cause, violated guarantee and correction; state the durable lesson and
  the check that would detect recurrence on a different implementation.
- Defined user/operator error outcome and recovery route, or why no interactive
  outcome applies. Follow [error design](../cms-development/feature-design.md#error-outcomes-and-recovery);
  if the correct behavior is unclear, ask the owner before selecting it.
- Exact regression file links and scenario names/identifiers when known, what
  fails before the fix and passes after, and references to actual executed evidence.
  Record platform/dependency limits and pending checks honestly.
- Links to the owning current contracts, changed prevention rule where needed,
  remediation dossier and source audit/issue/decision as applicable.

Do not store credentials, real installation addresses, private settings, personal
data or raw sensitive logs. Use synthetic reproduction inputs. Historical imports
cite original evidence and say what was not rechecked; do not claim a new test run.
Where a scenario name is unknown, link the verified file/evidence and state that
the exact filter needs confirmation before executing it.

## Indexes and preventing recurrence

Add one compact entry to `<area>/README.md`: ID/link, one-line violated guarantee,
matching capabilities/mechanism tags and the primary regression reference. Other
affected areas link to the same canonical record instead of duplicating it. Add
new area routes to the top-level README as needed; keep unrelated record details
out of that routing index. Avoid indiscriminate lists of every bug in AGENTS.md.

Keep area indexes to roughly 25 records; split larger ones into mechanism/topic
indexes with short routing summaries rather than making agents read a growing
chronological archive. On new discovery, update the relevant indexes and checks,
not every old feature dossier.

Before completing remediation, retain and execute its observable regression,
inspect equivalent entry points for the same mechanism, and update the relevant
contract/standard when a missing rule enabled the defect. If an existing rule
already covers it, cite it and explain the enforcement gap instead of duplicating
the rule. Link the record from the remediation dossier and release changelog.
Security findings use the same requirements with the applicable threat checks.
Keep the remediation dossier's inventory and final
[defect summary](../cms-development/feature-lifecycle.md#defect-summary-in-the-completion-report)
consistent with the canonical record's kind and status.
