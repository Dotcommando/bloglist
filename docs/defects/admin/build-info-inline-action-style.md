# Build information trigger lost the inline action affordance

- ID: `admin/build-info-inline-action-style`.
- Kind: confirmed bug. Status: fixed; both real-browser regressions passed.
- Discovered: 2026-11-18; reproduced at `cb5495d` on the 0.15.2 branch.
  Introduced by the summary-to-Popover-button correction at `5282b99`.
  Fix target: 0.15.2 before publication.
  Released in v0.15.2 at `df90e5f`; actual hosted release checks succeeded.
- Read when changing: inline text actions, header build information, summary to
  button migration, shared interaction styling, dotted underline.

The semantic button correctly dismissed the overlay but no longer inherited the
shared summary action style. It lost the dotted underline that identifies a
same-screen action rather than a navigation link. Its local color override also
prevented the shared action accent.

Correction: use existing `button.cms-text-action`, remove the local color override,
retain native button/Popover keyboard behavior and the existing 44px target.
Do not duplicate the common dotted/hover style inside an individual component.

Executed RED: both real browser widths computed decoration `none/solid` instead
of `underline/dotted`. [Browser regression](../../../test/integration/cms-build-info.integration.spec.ts)
asserts computed appearance and existing dismissal/keyboard behavior. GREEN and
release evidence: [verification](../../changes/0.15.2/release-readiness/50-verification.md).
This is a presentation bug; no security impact or operator recovery is inferred.
Owning contract: [inline text actions](../../arch/admin-frontend.md#inline-text-actions).
