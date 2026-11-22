# admin/new-page-partial-publication-state

Kind: confirmed bug. Status: fixed. Discovered: 2026-11-18.
Affected: 0.15.2; earlier range not established. Fix: 0.15.3.
Tags: new-page, Save-and-publish, partial-save, URL-availability, reconciliation.
Read when editing mutation failures or refreshing newly created page state.

After creation, a failed publication could already have assigned the URL, but
the editor continued claiming no URL existed. Its routing-change effect only
refreshed a page present at mount; a newly created page had no initial identity.
This incorrectly blamed the entered path and left the user without truthful state.

Correction: after a saved draft and failed publication, explicitly reread the
current publication options using the acknowledged page identity. Preserve input
and the failure notice. An assigned address becomes read-only; public availability
remains independent. A failed reconciliation shows unknown/settings failure,
not the stale no-URL claim. Expired authentication follows the existing sign-in
boundary. Never automatically repeat publication after uncertain effects.

Regression: [admin-rendering-ui.integration.spec.ts](../../../test/integration/admin-rendering-ui.integration.spec.ts),
`reconciles a partially assigned URL after publication failure (read 200/503)`.
Both new-page browser cases executed RED with the obsolete warning still visible.
They check retained input, state and exactly one publication attempt.

[Admin contract](../../arch/admin-frontend.md),
[evidence](../../changes/0.15.3/page-publication-failure/50-verification.md).
