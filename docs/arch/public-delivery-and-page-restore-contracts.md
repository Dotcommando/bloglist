# Public delivery and page restoration contracts

Date: 2026-10-24

Status: Accepted by the owner and implemented. The owner accepted public HTTP,
the new operation contracts and restoring the entire draft including rendering.
See [ADR 0008](../adr/0008-public-delivery-and-page-restoration.md).

References: [rendering and publication](rendering-and-publication.md),
[ADR 0007](../adr/0007-simple-page-publication-and-releases.md), and
[the existing use-case specification](scenario-001-use-cases.md).

## Historical initial scope

RenderPublishedPage, GetPublishedArtifact, ListSites, ListPages and
RestorePageVersion were the initial batch, with fake-port tests, real adapters and
AppModule wiring. The former five-operation test cadence is superseded by the
[current testing policy](../cms-development/testing-policy.md#required-scenario-selection):
relevant integrations pass before completion. Subsequent authenticated admin
capabilities follow their own contracts; the exclusions below describe this
initial public-delivery batch, not the current CMS capability set.

The public HTTP entry serves documents and assets through GET/HEAD. Keep site/page
administration local: no administrative REST, authentication system, admin UI,
games or bookings are required. Request rendering initially uses public read-only
loaders and explicitly declared request inputs. Do not pass cookies, authorization
headers, local-operator authority or raw request objects to loaders. Account-based
private content is a later capability, not an implicit feature of this boundary.

## Input and result contracts

| Operation | Input | Result |
| --- | --- | --- |
| RenderPublishedPage | siteId, releaseId, renderPlanId, optional typed requestValues | releaseId, pageId, composed HTML and hashes of inline styles for delivery |
| GetPublishedArtifact | siteId, releaseId (null only for legacy assets), path relative to public/ | Public artifact metadata, binary content and inline-style hashes, or null |
| ListSites | No input, retaining IListSites | Site[] under trusted platform administration |
| ListPages | Existing siteId and optional IPageFilter | Complete owned Page[], retaining IListPages |
| RestorePageVersion | siteId, pageId, version position enum: 1 latest, 2 previous, 3 oldest retained | Saved Page in DRAFT state |

Site/release/plan identities come from trusted local context or public domain/path
resolution, never unchecked form fields. Published delivery requires a same-site
release that has actually been activated; Ready-but-never-active output is not
public. Previously activated releases remain available for in-flight resources.
No new source-revision or editorial approval workflow is introduced.

## Request rendering

ResolvePublishedPath selects the active release once. RenderPublishedPage loads
the exact selected private plan; it does not select a newer release midway.
Parse persisted data explicitly, restore UTC Date values and validate site/page/
plan identity, manifest membership, phases and prebuilt asset references.

Execute Request bindings with preview=false, using the existing typed schemas,
read-only registry, deadlines, failure policies and per-request deduplication.
Build values must already exist in the saved plan. Missing frozen Build data is
a consistency failure, never permission to rerun a Build loader. No source files,
TypeScript compilation, JS obfuscation or CSS extraction are used on a request.

Compose HTML and insert the plan's prebuilt structural/visual CSS and JS in the
established positions. Return HTML and inline-style hashes; the HTTP adapter owns
headers and status mapping. Required loader failure returns an explicit failure,
not partial success HTML. Use no-store for Request documents in this first version.

Public navigation accepts arbitrary bounded query data under
[ADR 0067](../adr/0067-public-referral-query-metadata.md): 12288 encoded query bytes,
128 pairs and 256 UTF-8 bytes per decoded name. Overflow returns 414 before
lookup/rendering. All undeclared fields are omitted from rendering inputs without
changing the browser URL. Repeated names become arrays; unknown arrays are
ignored and declared scalar inputs reject them. Normalize declared scalar strings,
numbers, booleans and enum values strictly by their schema; validate structured
values as data rather than expressions. Missing/invalid declared values and
malformed URI encoding still fail validation. Unknown names never require a
marketing-source allowlist. Programmatic callers can supply already typed values.

## Public artifact and HTTP delivery

Add narrowly scoped outbound reads for verified public bytes and private Request
plans. GetPublishedArtifact checks manifest visibility, ownership, safe relative
paths, size and checksum. It cannot return manifests, plans, diagnostic source maps,
configuration, filesystem paths or another site's content. Private path requests
and unavailable public resources return null; corrupt declared artifacts fail.

Give newly built public assets release-qualified URLs, for example
/assets/releases/<releaseId>/styles/common.reflow.<hash>.css. Their physical files
retain the existing public/assets/... layout. Update generated CSS/JS/media URLs
and private preview rewriting together. Preserve delivery of legacy hashed URLs
from previously activated releases rather than silently breaking existing exports.
Selecting an asset must not reread the current active pointer and accidentally
substitute another release's file.

Only legacy assets/... paths accept releaseId=null. Their lookup selects a
matching public file among that site's activation receipts, newest first. It
cannot look up a document or a never-activated release. Newly generated exports
include an asset-prefix rewrite in _redirects; static hosts must consume that
rule or configure its equivalent to preserve the public/assets/... disk layout.

Add a separate npm run start:http entry with validated bind host/port. Default to
127.0.0.1:3000 for local use; deployment can configure the listener explicitly.
Resolve the normalized HTTP hostname through registered sites, reject unknown
hosts, and ignore forwarded headers unless proxy trust is separately configured.
Reserve /api, /admin and the engine's asset namespace; do not route them to pages.
Public controllers call read-only inbound interfaces and do not inherit local
administrative operations or privileges.

Return actual 301/308 redirects, static HTML, Request HTML or 404 from one release
selection. HEAD has the corresponding GET headers without a response body. Use
the artifact MIME/checksum for Content-Type/ETag, immutable caching for versioned
assets, revalidation for static document routes, no-store for Request HTML and
CSP-compatible inline-style hashes. Public errors expose no private diagnostics.
No public business API, cookies, CORS policy for cross-origin commands or admin
endpoints are added by this read-only delivery boundary.

## Lists

Add assertCanListSites() to the sites access port and its real local adapter.
ListPages reuses assertCanReadPage(siteId). Verify result identity/scope, preserve
the existing filters and stable repository ordering, and return complete arrays.
Do not add hidden pagination, omit drafts or exclude archived sites from local
administration. Reuse the already implemented repository methods.

## Restoration

Replace the current editable content with the selected
retained publication's title, heading, SEO, body, type, robots setting and rendering
configuration (template, parameters, delivery/interaction policy and loaders).
Preserve pageId, siteId, immutable mark, language, cluster relationship, creation
time, first-publication time and routing identities. Set DRAFT explicitly.

There is still exactly one editable record. Restoration replaces that draft; it
does not create a backup draft, add a published version, discard the three retained
versions, publish or change the active site release. Missing templates may be
fixed while editing the restored draft; restoration does not execute loaders or
require an approval step.

Version positions are defined at invocation time, newest first. Require the owned
page and selected retained version. Extend the pages publication port with an
atomic restore operation carrying the captured page/version state. A concurrent
edit/publication/pruning conflict must leave the draft unchanged, never restore
different content after positions move. Missing page/version fails NotFound;
cross-site data fails Scope. Use the existing update permission. Do not add an
inbound expected-version field or claim protection for unsaved browser edits.

## Verification

Cover public and local access separation, two sites with the same paths, frozen
Build reuse, independent Request executions, missing/corrupt plans, injection and
schema failures, GET/HEAD, real redirects, private artifact denial, traversal,
release switches with old resources still loading, complete list filters, all
three restoration positions and transaction rollback/concurrency. Test actual
HTTP/browser delivery using isolated migrated MongoDB and publication roots,
including production JS interactions and existing rendering/routing regressions.

The integration suite uses a real replica-set database, application restart,
real HTTP listeners and the production browser bundle. It checks isolation of
two sites with identical paths, inline-style CSP, typed query rejection, loader
failure, corrupt publication data, old resources across release switching, all
three restore positions and rollback after a selected version moves.

## Invocation

After npm run build and explicit migrations, npm run start:http uses
ZARYA_MONGO_URI, ZARYA_MONGO_DATABASE, ZARYA_ARTIFACTS_ROOT, ZARYA_HTTP_HOST and
ZARYA_HTTP_PORT. It requires no local-operator settings or site source directory.
Map the requested hostname to the registered site domain when testing locally.

Custom read loaders are trusted backend registrations, not executable page
configuration. A site's bootstrap passes the same IDataLoader registrations to
createPublicHttpApplication({ ...readPublicHttpSettings(process.env), loaders })
that its publishing context receives in rendering.loaders. The generic entry
has an empty registry; it does not discover or execute arbitrary modules.

ListSites, ListPages and RestorePageVersion resolve through LIST_SITES, LIST_PAGES
and RESTORE_PAGE_VERSION in the local AppModule. Administrative HTTP is deferred.
For a container listener, the configured bind address is 0.0.0.0 and Compose
exposes it on 127.0.0.1:3000. Start the public entry with:

```text
docker compose --profile application run --rm --service-ports app node dist/public-http.js
```

Publishing uses the same persisted artifact volume. Starting a listener does not
create sites, publish content or apply migrations.
