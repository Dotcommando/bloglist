# Page editor access verification

## RED

On `469ff6c`, `npm test -- test/adapters/admin-content-http.spec.ts -t 'projects an update response'`
failed two assertions. A writer with no read grant and a writer whose read
grant covered only their own pages each received the full synthetic draft,
including its stored metadata. The matching group case preserved its response.
The loopback test required local network access outside the shell sandbox.

The Playwright case subsequently reached the Save action after read revocation
in an already-open editor. The expected draft save confirmation was absent.

## GREEN

`npm test -- test/adapters/admin-content-http.spec.ts test/adapters/rbac-admission.spec.ts test/architecture.spec.ts`
passed 15 checks after the change. The controller returns receipts for missing
and non-matching read scope, preserves the read-authorized response, and keeps
the ordinary validation and authorization outcomes.

## Final verification

- `npm run test:integration -- test/integration/admin-users-http.integration.spec.ts test/integration/admin-users-ui.integration.spec.ts -t 'opens and saves linked drafts|opens page creation without requesting the page tree'` passed both cases. Playwright used headless Chrome, the real dispatcher and an isolated MongoDB replica set for PAGE-ACCESS-01 through PAGE-ACCESS-06. The browser signed in as the owner, a full editor, an editor without list access, a reviewer, and a writer without read access. It verified the role hint, direct-link behavior, persisted drafts, denied operations, and the exact update receipt. A read grant scoped to own drafts returned a receipt for another user's draft and the full saved state for a matching draft. Revoking read during editing still showed confirmation after the save and closed the editor.
- `npm run test:integration -- test/integration/admin-users-http.integration.spec.ts -t 'manages accounts through real HTTP'` passed the existing account, session and scoped RBAC regression.
- `npm run format`, `npm run lint`, `npm run typecheck`, `npm run build:server`, and the production administration build passed. Vite reported its existing chunk-size warning. The HTTP suites used local loopback access and the test databases and servers were closed by the fixtures.

One newly confirmed vulnerability was fixed. No bugs were confirmed. The one
new record is [pages/draft-update-response-read-scope](../../../defects/pages/draft-update-response-read-scope.md).
