# CMS 0.15.2 release readiness

Target 0.15.2, branch `0.15.2`, baseline `cb5495d`. Owner authorizes restoring
dotted action styling, checking release workflow, commit/push, merge to master,
publication, then local site update/commit. Production deployment is excluded.
Complete: host/browser/Docker and clean Linux preflight passed. Branch pushed and
merged into master; immutable v0.15.2 targets `df90e5f`. Actual GitHub gateway and
all release/publication steps succeeded; assets downloaded and verified.
Local site consumes the published source and passed native/browser/install/image
checks. Update committed locally as `2f3936a`; six cookie-notice owner files are
preserved outside that commit. No site push or production deployment performed.
No required check remains pending within this scope. Earlier unrelated site-
editing fixture failures remain documented in its installation audit.

[Behavior](10-behavior.md) · [Existing behavior](20-existing-behavior.md) ·
[Design](30-design.md) · [Cases](40-cases.md) · [Verification](50-verification.md) ·
[Decisions](60-decisions.md)
