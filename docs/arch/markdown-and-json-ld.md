# Markdown and JSON-LD publication

CMS 0.10.0 implements ADRs [0053](../adr/0053-markdown-representations-and-editor-preview.md)
and [0054](../adr/0054-json-ld-profiles-and-graph-publication.md). Both use the
existing saved draft, publication snapshots and selected immutable release.

## Markdown

The public gateway negotiates text/html and text/markdown using Accept quality
values. HTML wins ties and wildcard requests. Negotiated responses vary on Accept;
static Markdown has its own artifact, ETag and GET/HEAD/conditional behavior.
Literal non-HTML documents retain their original MIME and content.

The conversion uses the complete composed HTML, including resolved TVs and
Snippets. It retains headings, lists, tables, links and image alternatives.
Scripts, styles, navigation and site footers are excluded; article-local footers
remain content. Static output is generated during publication. Request Markdown
converts the single resolved HTML result without another loader invocation and
retains no-store delivery.

View in MD opens the current active publication. Its arrow exposes only View
draft in MD. The latter reads the saved draft without saving the editor.
Unpublished pages retain the draft action and explain why the main action is
unavailable. Both administration previews require editor access, are no-store
and noindex, and preserve unsaved input on failures.

## JSON-LD operations and persistence

ListJsonLdCatalog and SaveJsonLdCatalog use siteId and an opaque catalog version.
Saving replaces the site's complete profiles/objects catalog using
expectedVersion; stale writes fail with Conflict. The owning GetSite operation
authorizes access before reading the catalog. New template/page/URL selections
are checked against authorized, site-scoped catalogs. Previously stored missing
references may remain in a draft for correction; publication validates them.

Profiles assign named roles, Schema.org types and typed property mappings to
HTML template keys. Multiple profiles may target a template, and a profile may
target several templates. The JSON-LD workspace has flat Profiles and Shared
objects lists. Template and page editors expose assigned profiles and required
inputs. Page fields/TVs retain their existing editors; shared references and
profile assignments are maintained in the JSON-LD workspace.
The assignment lists link to the profile in that workspace. Catalog read
permits the profile view. Catalog save permits editing the definition and
assignments.

The drawer's create control opens a keyboard-accessible preset chooser.
Shared objects offer Person and Organization; profiles offer WebPage, Article
and Service. These are draft initializers, not persisted site/demo records.
Person and Organization start with empty name/description, an empty sameAs list
and, for Person, jobTitle. No addresses or identities are fabricated.
WebPage maps page title, description and language. The editor offers existing
page fields only; `description` properties use `metaDescription` in new profiles.
Saved `description` page-field mappings resolve `metaDescription` when no explicit
prepared `description` value exists. Article and Service add a
second node linked through mainEntity/mainEntityOfPage; their headline/name
and description reuse page fields. Author/provider selection is optional and
stores an explicit shared-object reference only after selection. HTML-template
assignment, ordinary editing and publication remain separate explicit actions.

Mappings accept constants, existing page fields, effective TVs, prepared Snippet
aliases, shared objects, current-page/node references, page-backed entities,
page-following addresses, exact addresses and validated external HTTP(S) URLs.
Nodes additionally accept optional keySource and presenceSource from constants,
page fields, TVs or prepared Snippet values. Without them, existing identities
and unconditional inclusion remain unchanged. A key is a stable ASCII identifier
(letters, digits, hyphens, underscores; 1–128 characters), scoped by node role
and the site's publication origin, independently of the displaying page.
Presence is strict: true includes, false/null/missing omits before checking the
node's properties; other types fail. Current-node references follow resolved
identities; optional references to omitted nodes disappear, required ones fail.
Cross-page references to nodes with these settings require unavailable foreign
prepared data and therefore fail when required, or disappear when optional.
See [ADR 0061](../adr/0061-json-ld-node-key-and-presence.md).

Prepared media yields public view-model URLs. Definitions cannot query storage,
execute code, fetch remote identifiers or read administrator data.

Organization/Person shared objects support text, finite numbers, booleans,
scalar lists, object references and address references. A graph collects only
reachable nodes, tolerates cycles, deduplicates identical contributions and
rejects incompatible types/properties. Role/key identities are generated
centrally as absolute fragments under the configured publication origin.
Primary-domain routing releases migrate these identifiers to the selected origin.

Page-following references resolve a page's route in the selected release.
Exact references retain urlId plus the page identity captured on selection;
redirects keep the selected address and report a warning. Missing required or
rebound references block publication; they never select a new occupant or draft.

Static HTML and private graph inputs are captured together. Request plans capture
the catalog, routing, bindings, page/TV values and frozen Build data; HTML and
JSON-LD share the same Request results. Safe serialization escapes the script
context, including closing-script payloads.

Incremental publication refreshes dependent graphs using retained published page
inputs and current shared definitions without publishing unrelated drafts.
Routing-only releases update route-derived graph values without compiling assets
or rerunning Build Snippets. A failure leaves the active release unchanged.
Older releases lacking the required private inputs require full-site publication.

InspectJsonLdDraft and InspectJsonLdPublished are authorized read operations.
Published inspection uses the active release; draft inspection composes the saved
draft. Invalid mappings, unavailable required values and graph conflicts return
Validation diagnostics identifying the role/property. Inspection never saves or
activates output.

Migration 0003 extends representation metadata; 0004 creates the site-owned
json_ld_catalogs collection and indexes. They follow the unchanged released
0002-deployment-diagnostics migration from CMS 0.9.2. Apply/verify the complete
chain after the unchanged baseline. Catalogs participate in complete site dumps
and guarded restoration.

The earlier unmerged 0.10.0 development snapshots used 0002 for Markdown and
0003 for JSON-LD. Those sequences were not released and conflict with the 0.9.2
chain. Use fresh isolated databases for those development fixtures; do not rename
persisted migration receipts or accept a different checksum for an applied ID.

## Upgrade and verification boundary

Rebuild both the application and deployment executor, apply and verify migrations,
and republish sites to generate Markdown and capture JSON-LD inputs. Redeploy the
bundled Worker to enable negotiation on Cloudflare; uploading artifacts alone
does not update an existing Worker. Saved drafts alone change no public output.

Focused unit/integration fixtures cover release isolation, Request execution,
typed values, graph conflicts, references, migration/index validation, HTTP access
and dump restoration. Browser fixtures exercise the built administration with
synthetic responses; external provider delivery is verified separately.
