# Add-ons, calibration, deployment and hooks review

- Kind: existing-feature review and resulting fixes.
- Branch/target: `0.15.2`; baseline `318a475b0ffb8c121e8dc6c9efec8e29609b30ba`.
- Prior requested commit/push: complete; origin/0.15.2 points to 318a475. New review remains uncommitted and unpublished; package metadata stays 0.15.1.
- Stage: `06-complete--done`.
- Scope: all 38 requested classes (12 add-ons, 9 calibration, 5 deployment, 12 hooks), including both history/detail methods and used adapters; bounded evidence/limits in audit.
- Last result: 288 passing selected unit/adapter/composition/architecture checks and 26 distinct real integrations. One unchanged POSIX helper socket/UID/GID test is excluded on Windows, not counted as passing.
- Source checks: format, lint, complete server/Svelte typecheck and build passed; Svelte 0 errors/0 warnings. Existing informational admin chunk-size advisory remains.
- Findings: 12 confirmed production bugs fixed, 0 new QA bugs, 0 confirmed vulnerabilities. All have canonical records and executed regressions. Catalogue implementation moved from infra to its outbound adapter without changing the port/policy.
- Documentation closure: 32 changed/new Markdown files, 173 local links/anchors, all 12 card/index/inventory kinds/statuses, 76 unique existing unit files, 15 integration files and all 38 operation table entries passed consistency checks. Git whitespace checks passed.
- Resources: verified task MongoDB ID/label/auto-remove, stopped it, confirmed no remaining matching container. The exact owned Synthetic source/artifact staging directory was checked under this checkout's .tmp, confirmed not a reparse target, and removed. Original external sources/artifacts and owner services/quotas were not changed; test listeners/processes close in fixtures.
- Required checks pending: none for the bounded changes. Linux POSIX permissions, exhaustive faults/all platforms, final image/real cgroup recalibration, full suite and live external provider/deployment remain explicit exclusions.
- Next action: owner review of the uncommitted change; use topical evidence below if resuming. No new release/deployment or automatic commit/push of this later review is implied.
- Blockers: none.

## Knowledge

- [Agreed scope](10-behavior.md)
- [Existing guarantees](20-existing-behavior.md)
- [Design](30-design.md)
- [Cases](40-cases.md)
- [Actual verification and defect inventory](50-verification.md)
- [Decisions](60-decisions.md)
- [Bounded audit](../../../audits/0.15.2-addons-calibration-deployment-hooks.md)
