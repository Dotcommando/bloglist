# Administration application

Read `src/AGENTS.md` in this directory for shared controls and interaction rules,
and `docs/arch/admin-frontend.md` for feature contracts. Reuse CreateButton.svelte
for square add actions. Minor confirmations
use SnackBar/showSnackBar with regular/failure/success variants; clipboard feedback
lasts 2000 ms. Keep actionable validation/errors beside affected fields.

Authored CSS uses px, %, vh, vw (plus unitless values and grid fr); mobile-first
layout thresholds are 576, 768, 992, 1200 px, with a 1440 px desktop cap. Preserve
flat shortened BEM and shared theme ownership.
