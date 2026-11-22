# Verification

Baseline 2671321, branch 0.15.3. Before backend implementation:

- `npm test -- test/adapters/page-release-build.spec.ts -t 'retains the site favicon'`:
  RED; `Foreign retained plan asset` for a valid CMS favicon link.
- `npm test -- test/adapters/routing-release-build.spec.ts -t 'retains the site favicon'`:
  RED; `Foreign or missing frozen asset` for the same supported link.

Read-only installation diagnosis independently reproduced the first error while
merging existing artifacts in memory. The old release passes full integrity
verification. No release was staged/activated and no owner data was changed.
Do not retain installation-specific identifiers, content or raw output here.

Additional RED evidence:

- Real authenticated publication with a stored favicon failed its HTTP document
  assertion: the session-owned source omitted the icon, unlike local composition.
- Both new-page browser cases (reconciliation HTTP 200/503) failed because the
  obsolete `#path-unassigned` warning remained visible. The original existing-page
  fixture already refreshed correctly; the regression deliberately uses creation.
- Restricted-shell attempts could not launch Edge/connect to the isolated MongoDB;
  those setup failures are not RED. Runs with the necessary local permissions
  executed the behavioral scenarios.

GREEN/final source checks in the corrected 0.15.3 working tree:

- Ten explicit unit/architecture/tooling files: 22 passed, including malformed
  favicon/foreign-asset rejection. Gateway: 21 passed.
- `admin-publication.integration.spec.ts` selected scenario: passed through real
  HTTP, MongoDB, stored favicon, Request retention, nested `.php` page and later
  URL moves. It compares canonical DOMs for equivalent empty-attribute quoting;
  static retained documents still retain their original byte assertions.
- `admin-rendering-ui.integration.spec.ts`, selected new-state/failure/existing-URL/
  session scenarios: 5 passed, 45 unrelated scenarios excluded. No automatic
  publication replay, input loss or stale no-URL claim in the new cases.
- `npm run format`, `npm run lint`, `npm run typecheck`, `npm run build`: passed;
  Svelte reported zero errors/warnings. `release-consistency.mjs`: 0.15.3 aligned.

- Real Docker image imports and negative cases: 7 passed in the exact integration
  file used by the release workflow. Temporary Docker build inputs/images cleaned.

Clean Linux preflight passed from committed candidate `bbd9c86`, using pinned
Node 26.7.0/npm 11.19.0 in an isolated executable tmpfs. It cloned committed source,
ran npm ci, consistency, typecheck/lint/build, gateway/tooling checks and verified
the packed archive's SHA-256 and extracted inventory. Documentation checks passed
for 17 changed/new documents and 129 relative links; staged whitespace passed.

Branch 0.15.3 was pushed and fast-forward merged into master. Annotated immutable
tag `v0.15.3` points to `bbd9c86c4562723795e0627671116e1421105581`.
[Gateway](https://github.com/Dotcommando/cms-zarya/actions/runs/44322342321) and
[release workflow](https://github.com/Dotcommando/cms-zarya/actions/runs/44322349375)
completed successfully, including all real Docker import/failure cases and source
publication. [Release](https://github.com/Dotcommando/cms-zarya/releases/tag/v0.15.3)
is published, not draft/prerelease. Downloaded archive SHA-256:
`d4d3e4ae246db79f11004f71091b85cc8a6c65d4210e4c3917b038beca439f70`.
Extracted payload checksum:
`b79bb0bcc2eda76846defb64dbc18c69bc1cb12a662594d95cc16ce930314e32`.

The local site consumed that actual artifact and committed/pushed the update as
`987e1c5186cb6c70b4d5c9dfc4fe9fbb588c0227`. Native build, format/lint/typecheck,
read-only migration verification, seven isolated Upcoming/Events cases and two
new-page browser cases passed. Both site Docker targets validated actual UID 1000,
version/provenance and unchanged Events 0.4.5. All 1094 retained file fingerprints
and 50 collection/index fingerprints matched; app/helper were recreated stopped,
and the existing local MongoDB stayed running. Test MongoDB was removed.

Production fetched the exact site commit through its read-only Git checkout and
applied code without data import under the existing `/root/kb` root. Both actual
images validated UID 1000, CMS 0.15.3, upstream identity and unchanged Events 0.4.5.
Delivery was settled before application/helper/executor shutdown. MongoDB and
proxy remained the same running containers; CPU budgets and settings were retained.

With application writers stopped, all 50 collection/index fingerprints and 473
retained filesystem fingerprints matched through read-only migration verification.
No migrations were applied. After coherent startup, files and business data still
matched; only authentication sessions, user locks and hook coordination changed.
Application health passed. Public root, admin entry/assets and existing Events
sessions API returned HTTP 200. External public admin asset hashes match the new
image, whose compiled private module embeds 0.15.3 and the expected upstream commit.

The exact production retained-release merge that failed before the fix now passed
against the same actual stored plans (36 resulting artifacts), only in memory:
nothing staged/activated. Active publication and complete successful delivery
status remained identical. No gift-page publication, robots edit, local content
import, provider reconfiguration or delivery retry was performed.

All requested runtime/release/site update work is complete. Post-release report
commits do not move the immutable tag, rewrite assets or rebuild running images.

Confirmed bug inventory (no demonstrated vulnerability):

1. [Retained favicon classification](../../../defects/publication/retained-favicon-rejected.md).
2. [Authenticated favicon source](../../../defects/publication/admin-favicon-source-missing.md).
3. [New-page state after partial publication](../../../defects/admin/new-page-partial-publication-state.md).
