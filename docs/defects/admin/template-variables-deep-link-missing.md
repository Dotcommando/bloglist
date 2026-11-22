# admin/template-variables-deep-link-missing

Kind: confirmed bug. Status: fixed. Discovered: 2026-11-18.
Affected: reproduced on baseline 8a5e693 (0.15.3); earlier range not established.
Fix target: 0.16.0.
Tags: administration, TV, deep-link, reload, server-shell-route, HTTP-404.
Read when adding administration sections or testing client/server route agreement.

Directly opening or reloading `/admin/sites/:siteId/template-variables` returned
404 although in-app navigation supported that section. The HTTP shell route
allowlist omitted the TV workspace. Browser tests serving a synthetic shell
could not detect this server/client mismatch.

Correction: allow exactly the supported site TV workspace path. Preserve the
Host check, GET/HEAD rules and rejection of unknown descendants/private assets.
Recovery is ordinary reload of the same URL after installing the correction;
no content mutation, data repair or retry of a previous save is required.

Regression: [admin-document-http.spec.ts](../../../test/adapters/admin-document-http.spec.ts),
`serves the TV workspace deep link for GET and HEAD without accepting arbitrary descendants`.
Executed RED (expected 200, actual 404), then GREEN with all six adapter cases.
The [connected journey](../../../test/integration/admin-site-journey.integration.spec.ts)
also navigates directly to this workspace using actual HTTP composition.

Prevention: verify direct navigation/reload through actual document delivery for
each tested workspace, in addition to client navigation. See the
[administration contract](../../arch/admin-frontend.md) and
[verification evidence](../../changes/0.16.0/admin-site-journeys/50-verification.md).
