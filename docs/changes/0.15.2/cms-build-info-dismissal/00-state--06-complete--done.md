# Build information dismissal

Bug fix; target 0.15.2, branch `0.15.2`, baseline `d0cba85`.
Owner reports version information stays visible after outside click or Escape.
RED confirmed: Escape (1440px) and outside click (320px) leave details visible.
GREEN: both new browser scenarios and both responsive deployment/header variants
passed. Native format/lint/typecheck/build passed. The copied site component also
passed both browser scenarios. No source behavior verification remains pending.
Package this reviewed source for the separate local installation rebuild; leave
its HTTP stopped for IDE startup. No push/release/production action is included.
No backend/schema change. Site has unrelated owner edits to preserve.

[Behavior](10-behavior.md) · [Existing behavior](20-existing-behavior.md) ·
[Design](30-design.md) · [Cases](40-cases.md) · [Verification](50-verification.md) ·
[Decisions](60-decisions.md)
