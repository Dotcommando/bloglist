# ADR 0020: Site-owned template and chunk editing

Date: 2026-10-26

Status: Accepted by the owner in the responsive editors discussion.

Key assignment and display names are superseded by [ADR 0021](0021-element-ordinals-and-display-names.md).

## Decision

Add ListRenderingElements, GetRenderingElement, CreateRenderingElement,
UpdateRenderingElement and PreviewRenderingElement. The rendering capability
owns Template/Chunk entities, their editable sources and parameter contracts.
Publication continues to own compilation and release activation. Administration
calls explicit authenticated REST operations. Local AppModule exposes the same
inbound ports. No domain/application/port imports a framework or storage API.

The owner requested use cases and fake-port tests first, adapters last. This
supersedes the usual per-use-case adapter implementation order for this task.

Each entity has an opaque elementId, trusted siteId, immutable case-sensitive
key/kind, an optimistic version, UTC lifecycle instants and HTML, CSS, browser
TypeScript and typed parameters. MongoDB is authoritative. Only an absent entity
falls back to site files; database failures never select the fallback. Catalogs
merge identities with database entities taking precedence. Stored browser code
is compiled for the public browser, never executed as server configuration.

Every acknowledged complete save also updates a private, atomic JSON source
backup under the configured site's `elements/templates/` or `elements/chunks/`.
One JSON document contains the entire entity, avoiding a partially updated group
of HTML/CSS/script/parameter files. Legacy site source files remain supported.
Backups are readable source data and provide the file fallback after database
loss. They are never served as public assets. Sites created without developer
source directories receive a deterministic directory and data-only site config.
Existing trusted TypeScript configuration is preserved.

## Outcomes and concurrency

Reads require an authorized existing site. Missing/foreign resources return 404;
invalid data returns 400; duplicate keys and stale versions return 409. Create
does not replace a file-only entity. Update adopts a file-only entity only when
its captured version still matches. A save changes the whole editable entity.

Source persistence and filesystem writes cannot share an atomic transaction.
Save first records the new entity with backup Pending. Backup synchronization
holds the current entity's exclusive edit guard; newer saves cannot overtake a
file write. Successful synchronization records Ready. Backup failure returns the
persisted entity explicitly as Pending, never a complete-save acknowledgement.
While Pending, only a retry of identical content at that version is allowed;
it repairs the backup without creating another content version. Unknown write
outcomes are checked by element identity/version before reporting failure.
No background job, automatic mutation retry or filesystem-to-database overwrite
is introduced. Published releases remain immutable throughout these operations.

Preview selects an owned page that uses the element and compiles the saved
sources through existing publication ports. It never saves/publishes a page or
activates a release. Browser delivery is authenticated, no-store and sandboxed;
preview code has no administration authority or live API access.

The UI has site-level Pages/Templates/Chunks navigation. At 992px and above the
contextual list and editor share the screen; below it they occupy separate panels.
HTML/CSS/browser TypeScript/parameter tabs preserve input and cursor state.
Private unsaved input stays in memory, and site departure warns before discarding
it. Each resource has a deep link. Shared source edits reach public pages only
through explicit publication, including full-site publication for all usages.

The owner's follow-up makes Save & apply the primary source-editor action. It
saves the selected entity and completes its file backup before invoking the
existing full-site publication operation. Save draft remains secondary and never
publishes. This combines existing operations in the UI without changing their
backend contracts or making source saves implicit publication. If publication
fails, the acknowledged draft/version remains and the UI reports that applying
changes was not confirmed.
