# Add-on browser test gates exceeded the TypeScript target

ID `qa/addon-browser-promise-target`. Confirmed in the CMS 0.16.1 candidate
on 2026-11-21 and fixed on branch `0.16.1`.

Two spinner scenarios used `Promise.withResolvers`. Node executes that
method, but the root TypeScript check includes test files and targets ES2023.
The release's mandatory `npm run typecheck` failed with TS2550 at both calls.

Use a local response gate built with the Promise constructor and keep release
of each held request in its existing `finally` block. The root typecheck
detects the same compatibility failure if an unsupported API returns. The
[browser scenarios](../../../test/integration/addon-card-ui.integration.spec.ts)
verify progress during repository and file actions and while opening settings.
See [preflight evidence](../../changes/0.16.1/addon-system-document-metadata/50-verification.md).
