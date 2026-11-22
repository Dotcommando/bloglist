# Administration site journeys

Kind: feature (test coverage). Target/branch: 0.16.0, agreed by owner.
Current continuation baseline: f5f09c7, initially clean. All owner-enumerated
remaining scenarios N01-N21 are implemented and verified; commit authorized.

Added 22 real-browser cases in seven independent files and selected two existing
TV/cache runtime cases. The parallel release gate now includes 164 cases in
28 files, capped at six workers (or available CPUs if lower), with zero retries.
Dependent actions within each file remain sequential. See the exact
[acceptance mapping](80-remaining-scenarios.md).

Final unfiltered npm run test:release:admin passed 164/164 in 28/28 files,
no skips/failures/unhandled errors. Vitest 199.61s; build plus gate 211.0s,
one 10.86s build, configured Windows/headless Edge host with 20 available CPUs.
The JSON report was independently checked. Typecheck passed with zero Svelte
errors/warnings; format, lint, five architecture/distribution checks, final
scoped ESLint, Git whitespace and relative Markdown link checks passed.

This continuation confirmed no new CMS product bugs or vulnerabilities and added
no canonical defect cards. Two known QA mechanisms were reused/fixed: fixture
drift/isolation and selection of unrelated resources. Historical product fixes
and counts are preserved separately in verification, not counted again.

All requested implementation and required checks are complete; no blockers or
pending feature work. Commit this verified work to 0.16.0. No remote push,
packaging or deployment requested/performed. Owner persistent app and dependency
services were not operated. Package metadata remains 0.15.3; target is 0.16.0.

See [behavior](10-behavior.md), [existing behavior](20-existing-behavior.md),
[design](30-design.md), [cases](40-cases.md), [verification](50-verification.md),
[decisions](60-decisions.md) and [previous coverage review](70-coverage-gaps.md).
