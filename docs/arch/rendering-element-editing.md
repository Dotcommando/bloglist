# Template and chunk editing

[ADR 0024](../adr/0024-snippets-and-pagination.md) extends these same entity,
authorization, ordinal, backup and publication workflows to editable Snippets.
Their server TypeScript, result contracts and execution boundary are documented
in [Snippets](snippets.md).

[ADR 0020](../adr/0020-template-and-chunk-editing.md) defines the owner-approved
editing and backup model. The rendering capability owns the entities and editable
source contracts. Publication owns composition, compilation and release activation.
All backend code remains layer-first under `src/`; the UI stays in `admin/`.
[ADR 0021](../adr/0021-element-ordinals-and-display-names.md) supersedes manual
creation keys and adds editable names.

## Application contracts

An element is identified by trusted siteId, Template/Chunk kind and an immutable,
case-sensitive registry key. Its separate opaque elementId identifies its stored
entity. Editable data consists of a name, HTML, CSS, browser TypeScript (nullable)
and typed parameters. Version and UTC createdAt/updatedAt belong to the entity.
Templates and chunks have distinct identities even when their keys match.

The shared recursive parameter editor must persist item type/default changes for
Array fields as well as Object properties, including false, zero, null and absent
defaults. Replacing a field must propagate through the parent binding; mutating
a temporary item array does not. The [browser regression](../../test/integration/admin-rendering-ui.integration.spec.ts)
guards this interaction for Templates/Chunks and shared Snippet result contracts.

| Operation | Input | Result |
| --- | --- | --- |
| ListRenderingElements | siteId, kind | Complete merged entity list, sorted by key |
| GetRenderingElement | siteId, kind, key | Entity and dependent elements/pages |
| CreateRenderingElement | siteId, kind, name and complete sources; no key | Automatically numbered entity and explicit backup state |
| UpdateRenderingElement | Identity, complete content, expectedVersion | Updated version, or repaired backup of identical pending content |
| PreviewRenderingElement | Identity, pageId, expectedVersion | Private compiled preview ID and URL |
| ReadRenderingPreview | Preview ID and trusted actor | Owned, unexpired compiled document after rechecking result and page read access |

The first five operations are bound through local AppModule inbound tokens and
authenticated administrative composition. The sixth supports authenticated HTTP
document delivery. In the administration interface, the preview action checks
read access to the using page. The document read action can be granted per site
and resolves the site and page from the owner-bound preview ID on every read.
An active global administrator retains the existing site access
policy; route IDs never confer authority. A missing/foreign resource produces
NotFound, malformed content Validation, duplicate keys/stale versions Conflict.
Access failures are propagated before source reads. There is no deletion workflow.

`IElementKeys` reserves a unique decimal key after the greatest numeric catalog
key, separately per site/kind. New sequences start at 1; failed saves may leave
gaps. Keys range through 9223372036854775807, stay strings in JSON/state/references
and use bigint only for ordinal arithmetic. The adapter stores exact BSON long
values in `rendering_element_sequences` with atomic allocation and site/kind
uniqueness. A missing sequence after recovery starts after the file catalog floor.
Authorization and validation precede reservation. There is no allocation endpoint,
caller-supplied creation key or automatic mutation replay.
Independent creations can contend on a shared authorization or hook guard.
The [database transaction](hooks.md) for creation may replay its aborted
writes up to seven times on a MongoDB write conflict, reusing the reserved
key and prepared hook intent. It rechecks authorization on each attempt and
preserves the existing conflict outcome when the retry budget is exhausted.
Backup acquisition uses the same budget before invoking its filesystem
callback. A failure after that callback begins follows the existing pending
backup reconciliation path.

Names are required, nonblank, one-line strings of at most 200 characters, may be
duplicated and can be updated under the existing version and backup guards.
Under [ADR 0022](../adr/0022-chunk-name-references.md), chunks can also be referenced
by display name with every whitespace character replaced by `_`: `Date Chunk`
becomes `[[$Date_Chunk]]`. Exact keys win over names; ambiguous normalized names
fail explicitly. Names are case-sensitive and can remain duplicated when callers
use keys. Unicode letters/marks/numbers, `_`, `.` and `-` are supported in aliases;
other display names use keys. Renaming requires updating named callers, while
keyed callers and already activated releases remain unchanged. Each/If targets,
usage discovery and frozen Request plans use the same resolution policy.
Old alphabetic keys remain valid and immutable; numeric references such as
`[[$1]]` remain supported.

`IElementStore` owns entity reads, compare-and-set writes and exclusive backup
synchronization. `IElementFallback` reads absent identities from source files;
`RenderingCatalogService` selects primary entities before fallback. A database
error propagates, rather than selecting a file. `IElementBackup` writes a complete
source snapshot. `IElementUsages` translates the existing template AST and page
references into direct/transitive usages, including If/Each dependencies. Broken
draft syntax conservatively marks potential chunk usages rather than hiding pages.
`IElementValues` supplies identities, versions and UTC instants.

## Persistence and backup recovery

The schema baseline creates `rendering_elements` with required siteId, explicit schema
validation and unique `(siteId, kind, key)`. Each write compares the captured
version. Use cases reconcile uncertain write acknowledgements by identity/version.
They do not retry a mutation automatically.

The baseline requires names and creates the site/kind ordinal collection. The
former name backfill is omitted for fresh installations under
[ADR 0039](../adr/0039-pre-release-schema-baseline.md). Old snapshots without names are
read with their key as the name and gain the explicit name on their next save.

A source save persists Pending first. Synchronization locks the current entity
inside a transaction, writes its file snapshot, then marks it Ready. Sessions and
the technical guard stay entirely inside the Mongoose adapter. Competing saves
cannot overtake a guarded file write. A failed file write leaves the database
entity Pending. HTTP returns that persisted state, and the UI displays a warning
instead of a completed-save message. Editing is locked until an explicit retry
of identical content at that version completes the backup. A lost synchronization
acknowledgement is checked against the recorded version/state.

The configured site directory contains:

```text
site.config.ts                      # existing trusted developer config, preserved
site.config.json                    # data-only mapping for a CMS-created source directory
elements/templates/<key>.json       # whole Template entity, including sources/parameters
elements/chunks/<name>.json          # whole Chunk entity, including sources/parameters
elements/snippets/<name>.json        # whole Snippet entity, including server sources/contracts
```

Only one site config is necessary; trusted TypeScript takes precedence if both
exist. A site without developer sources receives a deterministic portable source
directory. Config creation and snapshot replacement are atomic. Chunk and Snippet
filenames follow their display names under
[ADR 0040](../adr/0040-readable-element-backup-names.md). Unicode and spaces stay
readable; unsafe filename characters are percent-encoded, and colliding names
receive `(2)`, `(3)` suffixes unrelated to entity keys. Saving a renamed entity
removes its old copy after writing the replacement. Identity is read from JSON,
so older numeric filenames remain readable. Paths and symlinks cannot escape the owned site.
Backups are private source data, outside publication web roots. Browser TypeScript
in them is compiled for the browser, never loaded as server configuration.

When a database entity is absent, a complete JSON backup takes precedence over
the legacy `templates/<key>/index.html` or `chunks/<key>/index.html` and their
CSS/client/config files. Updates adopt the captured file entity into the database
without changing its registry key. File backups retain the same content version
and parameter distinctions, including missing/default/empty/false/zero/null.
These files back up rendering sources; existing site identities/configuration are
still necessary when restoring a site's other data.

## Browser and REST behavior

REST paths use `/api/admin/sites/:siteId/templates` and `/chunks`, with GET lists
and POST creation. A key suffix selects GET or POST update; `/preview` POST selects
an owned using page. Update and preview require expectedVersion. Ownership,
actor, version-generation and publication fields cannot be supplied in bodies.
All operations retain the existing cookie, exact Host/Origin, JSON/custom-header,
no-store and sanitized-error boundary. No query parameters are accepted.

The Snippet update body accepts `draftOnly: true` to save source without
refreshing active consumers. Updates by actors without site publication access
always save only a draft. The editor uses the draft-only update for both save
buttons. Save & apply then requests full-site publication separately.

Browser routes are `/admin/sites/:siteId/templates` or `/chunks`, with `/:key`
for editing and `/-/new` for creation. The creation segment does not reserve an
otherwise valid source key such as `new`. Reload and Back/Forward retain context.
The form edits a name and contains no key input. Drawer rows, headings, usages and
the page template selector use names; search also matches numeric/legacy keys.
Renaming preserves deep links. Page/source rows have a persistent background and
a contrasting selected border with unchanged geometry.
Template rows share a document-layout icon; chunk rows share a distinct blocks
icon. Decorative SVGs do not change accessible row names. Under the editor
heading, a live usage hint follows the current name, including unsaved edits.
Saved chunks show their name alias and actual `[[$key]]` reference. The latter
remains stable when renamed. New chunks receive the references after saving.
Templates explain selection through a page's publication settings. An expandable
syntax reference covers chunks/parameters, page fields, Build/Request loader
declarations and local result aliases; generic loader names are marked as
examples requiring backend registration. For chunks with declared parameters, the reference uses their current names, nested object paths
and defaults. It distinguishes contracts/defaults from values passed by callers and computed
Snippet outputs. Links open the current chunk at `?file=parameters` and its scoped using
entities without discarding editor buffers. Reloading that browser link selects Parameters;
it does not add query parameters to administrative REST requests. Backend-registered
Snippet implementations are not represented as editable result fields.
Usage rows retain the names returned by the source lookup. The administration
response marks targets readable for the current actor. The editor links only
those rows and explains the missing access below the list when needed.
For a chunk without parameters, a boilerplate parameter example explains
declaring `title` as String, using `<span>[[+title]]</span>` inside the chunk and
calling ``[[$Date_Chunk? &title=`[[*title]]`]]`` from a template. The UI does not
introduce `{{...}}` interpolation or loader registration.
Section navigation is above the contextual list/editor. At 992px and above they
are side by side; below it they are full-width panels with inert inactive content.
Both interface languages and the shared responsive matrix are supported.

Source tabs retain inputs, cursor and scroll state. Private unsaved buffers stay
in memory across elements and sections, never browser storage. Leaving the site
or reloading warns before discarding edits. Cancel explicitly discards the selected
buffer. Validation/conflict/network failures keep input; loading a current version
requires confirmation before replacing unsaved data. Source save does not publish.
Adding `[[+title]]` in HTML reads a value but does not declare its parameter
contract. Declare `title` (for example String) in Parameters and forward it with
``[[$1? &title=`value`]]``. A draft save checks the entity's own invariants, not all
callers, so chunk and template drafts can be saved independently even while their
combined contract is temporarily incompatible. Publication compiles the current
saved sources together and rejects incompatible calls before release activation.
Full-site publication applies shared edits to all published pages; the existing
single-page publication still retains other pages' frozen artifacts.

With source write access, Save draft is available independently of site
publication. It is the primary action when `cms.publication.publish-site` is
missing. After a completed draft save, the status explains who can apply the
draft to the site.

The primary Save & apply action saves the selected element, requires a Ready file
backup and then invokes full-site publication. Only an acknowledged activated
release produces the applied message. Save draft is secondary; Ctrl/Command+S
also saves a draft. Validation, version conflicts and Pending backups never start
publication. Both stages lock the editor and navigation. A publication failure
keeps the saved entity/version and reports the partial result, including after
creation changes the URL to the saved key. An expired session stays on login.

Known validation rejection (HTTP 400) is distinguished from an unconfirmed
publication/network failure. Authenticated error JSON can include `diagnostic`
with a closed `issue`, source kind/key and parameter name. Supported issues are
MissingParameterSeparator, UnknownChunkParameter and MissingChunkParameter. The
renderer supplies this structured domain error without raw source, parameter
values, filesystem paths or stack traces. The admin translates it, identifies
the correction and links the source element. Unexpected errors remain sanitized.

Sites, Pages, Templates and Chunks share `admin/src/shared/ui/CreateButton.svelte` for their
44px square creation control, accessible label, disabled state and centered SVG
plus. New entity lists reuse this component.

Preview reuses PreviewPage and existing build ports without saving pages or
activating releases. It checks the selected source version around compilation.
`/api/admin/rendering-previews/:previewId` rechecks session, owner and site access
on every GET. Documents expire after ten minutes and are private/no-store. The
compiled CSS/JS/assets are embedded into the sandboxed document. Scripts can
exercise local browser interactions; the preview has an opaque origin, no parent
administration access, no forms and no live API connections. Public delivery
continues to use only immutable activated releases.

## Verification

Application unit tests retain deterministic fake store, fallback, backup, access
and publication ports. Adapter tests cover input translation, file round trips,
source isolation and guarded storage error translation. Real isolated MongoDB/
HTTP integration covers entities, backup recovery, uniqueness, concurrency,
publication visibility, protected previews and compiled preview scripts in a
browser. Production-bundle fixture tests cover editing, typed parameters, buffers,
conflicts, partial backups, both languages and all shared viewport widths. Chrome
verification does not establish iPhone Safari device compatibility.
