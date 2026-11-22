# Existing authorization boundaries

- Administration accounts and sessions are installation-wide. Active
  administrators currently access every site. The dispatcher authenticates
  protected administrative requests before controllers consume body bytes.
  `allowedSiteIds` is reserved and currently remains empty. The new model uses
  explicit role assignments for authority.
  User lifecycle operations already guard the last active administrator in a
  transaction. [Authentication](../../../arch/admin-authentication.md) ·
  [Administration users](../../../arch/administration-users.md#operations)
- The [Pages list use case](../../../../src/app/use-cases/pages/list-pages.use-case.ts)
  checks site-level read access and queries by site. The
  [current page state](../../../../src/domain/pages/page.ts) carries site identity
  and creation time. Creator and access-group attributes need a design for
  existing objects and new writes.
- [Site add-ons](../../../arch/site-addons-contracts.md#runtime-and-frontend-extension-contracts)
  use operation access classes to govern site connections. Connection availability
  and an actor's authority are independent checks. CMS remains free of business
  add-on registrations.
- The [private system API](../../../arch/system-object-api.md#composition-and-authority)
  and its [snippet and add-on bridges](../../../arch/system-object-api.md#snippet-and-add-on-bridges)
  have their own trusted execution identities. Build, Request, and preview can
  invoke commands. The implementation design must account for these pathways
  when granting rights to edit or run code.

The runtime, add-on, and QA defect indexes were checked for the changed
boundaries. [Disconnected dispatch admission](../../../defects/runtime/disconnected-dispatch-admission.md)
is relevant if dispatcher changes introduce an awaited authorization step.
[Optional telemetry admission fixtures](../../../defects/qa/optional-telemetry-admission-fixture.md)
show why authorization regression tests must reach their intended boundary.
Add-on installation and staging failures concern runtime lifecycle rather than
actor grants, so those records are outside this model's scope.

The [URLs workspace contract](../../../arch/url-workspace.md) owns virtual
folder creation. The administration index's page-save recovery records concern
draft persistence and publication, outside the scope of the link's visibility
and label.

For interface recommendation 1, the page tree gates drag on `cms.pages.set-position`
and only loads for `cms.pages.list`. Existing pages use the tree to move to a new
parent. The page editor's numeric sort order is part of the draft update.
The Pages and Administration defect indexes cover adjacent move/persistence and
editor recovery issues. This follow-up changes contextual guidance.

For recommendation 2, the editor already saves drafts without page options.
Its published-output controls used page-option availability as a prerequisite
for invoking the separate Markdown and JSON-LD reads. Site options can include
public availability without loading the per-page settings.
Media reuse discovery reported literal Snippet references that the move rewrite
did not visit. The browser test reproduced the stale source after a move.
See [the media defect](../../../defects/media/file-move-skips-snippet-links.md).
