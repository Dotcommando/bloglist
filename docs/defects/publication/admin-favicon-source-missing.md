# publication/admin-favicon-source-missing

Kind: confirmed bug. Status: fixed. Discovered: 2026-11-18.
Affected: 0.15.2; earlier range not established. Fix: 0.15.3.
Tags: authenticated-publication, composition, site-favicon, publication-source.
Read when adding publication-source dependencies to local or session composition.

Authenticated publication built its own source adapter without the optional
favicon store, although local publication already supplied it. Newly published
pages therefore omitted an installed site icon. The real HTTP regression failed
because the new Request document lacked the stored favicon version.

Correction: inject the configured favicon store into the session-owned source
under the same explicit media boundary. Its stable snapshot is disposed by the
existing PublicationSourceAdapter. No fake fallback or new media authority.

Regression: [admin-publication.integration.spec.ts](../../../test/integration/admin-publication.integration.spec.ts),
`publishes a page and retains static/Request pages and their assets across later publications`.
It installs a synthetic icon through the real store and asserts its presence in
the HTTP document before testing later page/routing releases. Real composition
is essential; another token-resolution-only test would miss the defect.

No new user error flow is needed: valid publication includes the configured icon.
[Contract](../../arch/rendering-and-publication.md),
[evidence](../../changes/0.15.3/page-publication-failure/50-verification.md).
