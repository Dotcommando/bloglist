# Existing guarantees and selected history

Current contracts: [authentication](../../../arch/admin-authentication.md),
[users](../../../arch/administration-users.md), [document defaults/system setup](../../../arch/document-mime-and-crawler-files.md),
[publication](../../../arch/rendering-and-publication.md) and
[restore/delivery](../../../arch/public-delivery-and-page-restore-contracts.md).
Preserve global active-account authority, empty reserved site assignments, safe
profiles, bounded password work, hashed opaque sessions, ownership/version fencing,
last-admin serialization, owned drafts, immutable page identity, current retained
versions and active-release isolation.

All 22 operation bodies and owning adapter paths were reviewed. The per-operation
and method/guarantee evidence is maintained once in the
[bounded audit](../../../audits/0.15.2-admin-auth-users-pages.md#operation-evidence),
not inferred from test filenames.

Selected historical records:
- [Disconnected dispatch/admission](../../../defects/runtime/disconnected-dispatch-admission.md):
  relevant ownership precedent for observing test requests; its coordinator lease
  implementation was not changed and its historical fork suite was not re-executed.
- [Public-only composition](../../../defects/composition/public-only-calibration.md):
  relevant to retaining real forbidden-authority checks and avoiding fake session
  fallbacks; calibration graph was not changed, so its unrelated regression was
  not added to this selection.
- New current findings route through [Pages](../../../defects/pages/README.md) and
  [QA](../../../defects/qa/README.md); exact scoped inventory is in
  [verification](50-verification.md#defect-inventory).

No unrelated historical audit or installed business add-on was needed. The
ClientSession investigation did not establish a supported post-commit resource
leak; retain the driver's actual cleanup guarantees and the owner's actionable
error-recovery decision rather than inventing a new operator flow.
