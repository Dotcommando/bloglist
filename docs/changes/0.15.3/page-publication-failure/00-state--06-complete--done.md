# Page publication failure

Kind: bug. Target: 0.15.3. Branch: `0.15.3`.
Baseline: `267132176b2ae5fc80e1fa0cb56fdf80f21043b6`.

The owner reports failed Save & publish for a new HTML page with a nested `.php`
path and the explicit basic template. Read-only installation checks confirm the
URL was assigned and the page version was published, but no new site release was
staged/activated. The editor retained an obsolete no-URL warning.

Confirmed: page/routing release builders treat the valid CMS-managed favicon
link in a retained Request plan as a foreign release asset. Both owning unit
regressions executed RED with the same errors as the read-only diagnosis.
Correction is GREEN in unit, real HTTP and browser checks. A separate real HTTP
RED established the missing favicon store in authenticated composition; corrected.
Complete. Source, Docker, clean Linux and hosted release checks passed. Immutable
tag v0.15.3 identifies bbd9c86. Both installations consumed the published source;
site code commit 987e1c5 was pushed and fetched on production through Git.
All required preservation and runtime checks passed. The original production
retained-plan failure now passes in memory against actual data. Production is
healthy on 0.15.3; publication/delivery unchanged. Local app/helper are prepared
but stopped; MongoDB instances retained and temporary test MongoDB removed.
Three confirmed bugs fixed and recorded; no demonstrated vulnerability.
No remaining implementation/check action. Future content publication belongs to
the owner; no gift-page publication or local content import was performed.

Agreed behavior: [10-behavior.md](10-behavior.md).
Preserved behavior: [20-existing-behavior.md](20-existing-behavior.md).
Design: [30-design.md](30-design.md). Cases: [40-cases.md](40-cases.md).
Evidence: [50-verification.md](50-verification.md).
Decisions: [60-decisions.md](60-decisions.md).
