# Rendering and publication

Page SEO/Open Graph fields, template references and creation-time slug suggestions
are described in [page metadata](page-seo-and-slugs.md) and
[ADR 0023](../adr/0023-page-slugs-and-seo-fields.md).

The third five operations implement [ADR 0007](../adr/0007-simple-page-publication-and-releases.md).
They run through local AppModule tokens. There is one editable draft and three
retained published versions per page; there is no editorial approval or source
revision workflow.

[ADR 0019](../adr/0019-admin-routing-and-single-page-publication.md) adds an
authenticated editor flow and PublishPageRelease. It publishes/renders only the
selected page and retains other active documents/assets/frozen Request plans in
the new release. Reused Request plans requalify injected asset links while
preserving Build values. Incremental releases may contain retained shared-asset
generations; the full-site operation still rebuilds shared groups across all
routes. Use full-site publication to apply shared source changes to every page.

ZaryaBasic is explicitly registered alongside filesystem templates in local and
authenticated publication composition. It renders title and sanitized Markdown
with the current page language. Selecting it supports publication without site
source files; it never replaces an invalid selected/configured template.
HTML editor publication requires an explicit URL and template. Raw text documents
follow [the document MIME/crawler contracts](document-mime-and-crawler-files.md)
and require no HTML template. Draft saves,
page-version publication and release activation remain separate stages, so a
failed later stage does not claim to undo previous saves. The MIME and system-document extension requires migration 0002 before bootstrap.

Local and authenticated publication capture the configured site favicon through
the same optional media boundary. Retained Request asset rebasing preserves the
exact CMS-generated favicon link: `/favicon.ico?v=<sha256>` is a site endpoint,
not a release artifact. Other CSS/JS references still require public manifest
membership; a marker or `rel=icon` alone never bypasses that validation. See the
[retained-link defect](../defects/publication/retained-favicon-rejected.md) and
[composition defect](../defects/publication/admin-favicon-source-missing.md).

Page-version persistence may repeat a database transaction at most twice after a
confirmed aborted write conflict, including contention with hook dispatch. Every
attempt retains the original captured page predicate and hook intent; checks and
external handler code are not replayed. Changed page state remains a conflict.
An uncertain commit result is propagated without retrying the mutation.

## Source configuration

Configure ZARYA_SITES_ROOT and ZARYA_ARTIFACTS_ROOT, or pass absolute sourcesRoot
and artifactsRoot in local application rendering settings. Defaults are sites/
and artifacts/ in the working directory. Register a trusted site directory:

```typescript
// sites/example/site.config.ts
export default {
  siteId: 'the-created-site-id',
  publicSettings: { locale: 'en' },
  templates: {
    Home: { parameters: [] },
  },
  requestParameters: [],
};
```

Use templates/Home/index.html and optional styles.css/client.ts. Each chunk has
its own chunk.config.ts with a parameters array. Parameter contracts use the
ParameterKind values String, Number, Boolean, Object, Array or Enum; name, kind
and required are explicit. Optional defaultValue, nullable, properties, items and
values describe defaults, nullable values, object members, array items and enum
choices. Unknown arguments and undeclared object fields fail validation.

```typescript
// sites/example/chunks/Card/chunk.config.ts
export default {
  parameters: [
    { name: 'title', kind: 'String', required: true },
  ],
};
```

```html
<!doctype html>
<html lang="[[*language]]">
  <head><title>[[*title]]</title></head>
  <body>[[$Card? &title=`[[*title]]`]]</body>
</html>
```

The document language comes from the current Page. A site-wide public locale
setting does not set the language of every page in a multilingual site. Linked
translations and generated alternate metadata are not implemented; see the
[multilingual site proposal](multilingual-sites-proposal.md).

Page-only styles/client files live in pages/<immutable-page-mark>/. They are
validated alongside registered template/chunk sources and included for that page.
Frontend sources expose identity, revision, CSS and browser TypeScript without
local paths. FileFrontendSourceLocationsAdapter maps site/source identities to
local directories only at the Vite boundary. Relative authored assets and module
imports retain the same source-root checks.

Source files are trusted developer code; edited page content is data. A site's
directory must map to exactly one siteId. Symlink/path escapes fail explicitly.

Referenced binary source assets are hashed through bounded reads and transferred
as lazy repeatable content, not retained complete byte arrays. Staging rechecks
their declared checksum/size; a changed source cannot silently activate mixed
output. HTML asset tasks start after the document's markup walk validates all
nodes, and their owned work settles before a build failure is returned.
Under [ADR 0020](../adr/0020-template-and-chunk-editing.md), editable Template/Chunk
entities in MongoDB take precedence over source files. Missing entities fall back
to their complete JSON backups or legacy files. Each complete source save updates
its backup; it does not activate a publication. Data-only `site.config.json` is
also supported for CMS-created source directories. See
[source editing and recovery](rendering-element-editing.md).

## Parameters, loaders and constrained composition

Reading a placeholder such as `[[+title]]` does not declare a parameter schema.
The chunk must declare that field in its typed Parameters contract, and callers
must pass required values after `?`. Source drafts may be saved independently;
the full current saved composition is validated at preview/publication time.
Administrative validation diagnostics identify an undeclared chunk parameter,
a missing required argument or a missing `?` without disclosing source values.

Under [ADR 0022](../adr/0022-chunk-name-references.md), chunk includes and Each/If
targets accept immutable keys or display-name aliases. `Date Chunk` is referenced
as `[[$Date_Chunk]]`; each whitespace character becomes `_`, preserving case.
An exact key wins; ambiguous names reject rather than choosing a source. Names
are captured in immutable Request plans, so public execution does not read draft
aliases. Renaming requires updating named callers; keyed callers remain valid.

For a String parameter named `title`, declared in the chunk's parameter contract:

```html
<!-- In the chunk -->
<span>[[+title]]</span>
<!-- In the template -->
[[$Date_Chunk? &title=`[[*title]]`]]
```

Existing MODX-shaped tags retain their documented meanings. Includes have lexical
parameter/alias scope. A whole value tag preserves objects, arrays, booleans and
numbers; mixed interpolation permits scalars only. Values are escaped when output,
not while being forwarded. Returned strings containing tags are never reparsed.
Text and quoted attributes are supported; executable HTML contexts, inline
handlers, dynamic tag/attribute names and unsafe URL schemes are rejected.
Use [[*contentMd:markdown]] explicitly for sanitized rendered Markdown in text.

Two reserved composition operations add constrained repetition/branching:

```html
[[Each? &items=`[[+catalog.items]]` &chunk=`Card` &as=`item`]]
[[If? &condition=`[[+hasDetails]]` &then=`Details` &else=`Empty`]]
```

Each passes one typed array item to the named chunk parameter (item by default).
If takes a strict boolean and static chunk names; omitting else emits nothing
when false. Other named arguments are forwarded explicitly to the selected chunk.
These names are reserved, not executable snippets or general expressions.

Register custom IDataLoader implementations in trusted local composition through
rendering.loaders. Registrations declare typed parameters/output and allowed
Build/Request phases. read receives trusted site/page/language, preview/phase and
an abort signal; it calls an owning application query, never a mutation. Markup
uses [[Loader? &input=`value` &as=`alias`]] for Build and [[!Loader?...]] for Request.
P3 configuration never executes these reads. Optional page bindings require an
explicit typed fallback in registration; required failures abort the operation.

Bindings are checked for scope, cycles and phase violations before execution.
Execution is sequential with a bounded per-read deadline and deduplication inside
one page/context by loader/phase/typed inputs. Build results for Request pages
are stored with their private plan. Request preview validates sample requestValues
against the configured requestParameters. Core operation does not require a
business loader, games or booking modules.

## Local invocation

```typescript
const configured = await application.get<IConfigurePageRendering>(CONFIGURE_PAGE_RENDERING)
  .execute({ siteId, actorId: operatorId, pageId, rendering });
const preview = await application.get<IPreviewPage>(PREVIEW_PAGE)
  .execute({ siteId, actorId: operatorId, pageId });
// Open preview.url in the browser; keep application alive while using it.
await application.get<IPublishPage>(PUBLISH_PAGE).execute({ siteId, pageId });
const active = await application.get<IPublishSiteRelease>(PUBLISH_SITE_RELEASE)
  .execute({ siteId, actorId: operatorId, expectedActiveReleaseId: null });
const resolution = await application.get<IResolvePublishedPath>(RESOLVE_PUBLISHED_PATH)
  .execute({ siteId, path: '/' });
```

Use the actual previous release ID after the first publication. A stale expected
pointer fails; activation is not an unconditional replacement. A lost commit
acknowledgement is checked against the persisted activation receipt. All five
operations are resolved by inbound tokens in src/infra/publication/publication.tokens.ts.
Administrative login and publication HTTP routes follow the current
[authentication](admin-authentication.md) and
[administration](admin-frontend.md) contracts; the original local-only milestone
no longer describes their availability. Public document delivery is provided
by the separate composition described in
[ADR 0008](../adr/0008-public-delivery-and-page-restoration.md).

## Build and storage

Vite compiles browser TypeScript to self-contained modules. Production modules
are minified and obfuscated without eval or public property renaming. Node,
configuration and cross-site imports are prohibited. Browser API primitives in a
dependency used by a None page fail the build. This is a developer policy check,
not a sandbox for hostile JavaScript. TypeScript checking and trusted API endpoint
contracts remain required for custom client code.

CSS is parsed with PostCSS, validated against the repository units/breakpoints and
split conservatively. Mixed/reset-dependent declarations stay structural when
splitting would change semantics. Custom properties, font-face and keyframe data
remain structural. Common source order is established before page overrides;
common dependencies precede page-only dependencies. cssnano minifies each group
independently. Unresolved imports/unsupported units fail with a diagnostic.

Shared structural/visual CSS uses hashed external files; page-only groups are
inline. Structural groups finish head; visual groups finish body, common first
in each position. Unused source CSS is validated but not included in common
output. Source maps are private. Authored local media/font references are copied
to hashed assets; images require width and height. Uploaded media processing and
its S3 adapter are outside these five operations.

Static documents live under public/<route>/index.html. Request pages have no
public final document: plans/<planId>.json contains their template inputs, frozen
Build values and compiled CSS/JS injection plan outside public/. The private
manifest lists routes, asset hashes and visibility. ResolvePublishedPath detects
missing/corrupt release data rather than falling back to current content.

Retained redirects have real rules in public/_redirects (the common static-host
rules format) and destinations in the manifest. A host that does not consume
that format must apply the manifest through its document-routing adapter; copying
HTML alone cannot implement HTTP redirects. Public GET/HEAD now maps these
manifest routes to real redirects, stored HTML or Request rendering.

New CSS/JS/media references use /assets/releases/<releaseId>/... URLs. Their disk
paths remain public/assets/...; _redirects includes the prefix rewrite for static
hosts. The HTTP adapter maps that prefix to the selected activated release and
keeps legacy hashed references available across switches. Only a declared public
file can be read; manifests, Request plans and diagnostic maps remain private.

Staging validates metadata, byte counts and hashes, writes a separate directory,
renames it to the immutable release path and records Ready metadata. Activation
then atomically updates MongoDB's pointer and receipt. Previous release output is
retained. Inactive staging directories after failure are not public and are not
automatically deleted. No cross-filesystem/database transaction is claimed.
For EPERM/EBUSY file locks, only the completed-directory rename has bounded
retries: five attempts with 25/50/100/200ms waits. A persistent error fails before
the Ready metadata insert. Metadata writes and activation are never replayed by
this filesystem retry.
The Docker image uses production dependencies and runs as node. Compose persists
publication output in its publication-artifacts volume. Mount the site's trusted
sources into /app/sites read-only when publishing inside that container; site
content is not copied into the generic engine image.

See the [public frontend/CSS contract](public-site-frontend.md) for authored CSS,
classification, cascade preservation and final HTML injection.

## Verification

Unit tests exercise fake application ports and adapter translation. At the agreed
five-operation boundary, integration tests use isolated migrated replica-set
MongoDB databases and temporary publication roots. Browser tests use an explicit
ZARYA_TEST_BROWSER_EXECUTABLE pointing to an installed Chromium browser.

The suites cover real compiled preview interactions, CSS computed-style/geometry
equivalence, three-version retention, active-release selection, failed builds,
competing activation and lost commit acknowledgements. These are correctness
checks, not a field CLS measurement or a deployment.

## Public delivery and editable versions

RenderPublishedPage, GetPublishedArtifact, ListSites, ListPages and
RestorePageVersion are implemented. See the
[accepted contracts and invocation](public-delivery-and-page-restore-contracts.md).
The public process needs published artifacts, metadata and the trusted loader
registry; it needs no site sources, local-operator authority or resource builder.
Restoring position 1/2/3 replaces the full draft, including render settings, while
leaving retained publications, routing and the active release unchanged.

## Recommended next five

1. UploadAsset: accept verified owned uploads and keep originals private in S3.
2. ProcessAsset: prepare all responsive profiles and actual dimensions before Ready.
3. GetAsset: read authorized metadata for template view models and editor selection.
4. Create a recurring session series associated with an owned Page.
5. Edit recurrence with an explicit occurrence/following/whole-series scope.

Under [ADR 0009](../adr/0009-game-pages-and-recurring-sessions.md), game content
uses ordinary Page operations; CreateGame/UpdateGame are retired. Media supplies
the two image roles in typed page parameters. Scheduling remains optional and
needs explicit series/occurrence contracts before code; items 4/5 name behaviors,
not final port names. These recommendations do not authorize another batch.
Before implementation, resolve C5/C6/C7: S3/upload limits, durable processing,
published-page/media lookups, recurrence generation/exception rules and effects
of scheduling changes on existing requests.

## Request execution and whole-page caching

Request Snippets are intended for separate execution on every page request.
Whole-document cache hits currently bypass them and can break that expectation;
compiled-plan/asset caches are a different mechanism. Before enabling page caching,
check the transitive composition for Request invocations and keep caching off if
any are present. The automatic warning/absence validation is a future requirement,
not implemented behavior; see [ADR 0087](../adr/0087-request-snippets-and-page-cache-guard.md)
and the [current cache contract](request-document-cache.md).
