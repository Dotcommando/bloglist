# Snippets

## Per-request purpose and cache incompatibility

A Request Snippet is intended to execute separately for every page request, using
the current validated request context and the selected release's code. It is not
a Build value and does not become an independently fetched browser fragment.
Within-request deduplication does not authorize cross-request result reuse.

**Whole-page caching can break this behavior.** The current document cache returns
complete HTML on a hit without rerunning its Request Snippets. Background refresh
is not execution for each visitor request. Time-dependent or current-data logic
can therefore be skipped or stale even though the page returns HTTP 200. A
snippet's SharedPublic declaration and HTTP no-store do not restore per-request
execution. Browser widgets may still work through their separate API calls.

Before enabling whole-page caching, check that the complete page composition has
no Request Snippet invocations. Until an automatic guard exists, perform this
check manually and leave page caching off when Request Snippets are present.
[ADR 0087](../adr/0087-request-snippets-and-page-cache-guard.md) records the required
future editor warning and backend/publication validation. That strict absence
check is not implemented; the [cache contract](request-document-cache.md) describes
the currently implemented opt-in behavior separately from this stricter requirement.

[ADR 0024](../adr/0024-snippets-and-pagination.md) names the existing typed data
loaders Snippets. Persisted loaders/loaderId bindings stay compatible. ISnippet
is the registration contract; IDataLoader remains its compatibility alias.

The Snippets tab is beside Pages, Templates and Chunks. It reuses the rendering
entity inbound operations for listing, reading, creating, updating and previewing.
The site-authorized REST paths use /api/admin/sites/:siteId/snippets, a key suffix
for reads/updates, and /preview. Browser routes use /admin/sites/:siteId/snippets,
/:key and /-/new. Existing session, Host/Origin, JSON/custom-header, no-query,
no-store, expectedVersion, backup Pending/Ready and publication semantics apply.
Only authenticated global administrators may edit sources. Local AppModule
exposes the same rendering operation tokens with Snippet kind.

Edit Server TypeScript, Parameters and Result contract. Server code is an async
function body with input (validated parameters) and context (siteId, pageId,
language, phase, preview and frozen publishedPages). Return JSON data matching
the result contract. Names and numeric keys support invocation; exact keys win,
and duplicate names require a key. Both Build and Request can be selected.
The editor retains private buffers, cursor and scroll state across tabs/sections,
warns before discarding them and keeps input on failed saves. Source saves create
complete atomic private JSON backups under elements/snippets/<name>.json, with
readable filenames under [ADR 0040](../adr/0040-readable-element-backup-names.md). Browser TypeScript
and HTML/CSS are separate element concerns and cannot be attached to Snippets.

Publication transpiles code and rejects syntax errors before activation. Compiled
code and contracts are frozen inside private request plans. The worker receives
JSON input, scoped public page summaries and a realm-local cms API proxy under
[ADR 0044](../adr/0044-system-object-api-and-bilingual-guide.md). Node/Nest services, environment,
imports and filesystem/network APIs are not injected. The worker/VM has a deadline
and resource/output limits; it is not an OS security boundary for hostile code.
Execution failures produce the existing sanitized required-Snippet failure; no
partial HTML or unsaved source is substituted. Requests never compile edited code
or read current draft implementations. Changing a source requires publication to
reach public pages, and historical releases retain their own code.

## Worker pool

The CMS reuses a bounded process-owned pool for edited Snippets in Build,
Request and preview. Every call still receives a fresh isolated realm and scoped
CMS client. Calls retain their existing order and publication semantics. Operators
can configure capacity, queue wait and deadlines; see the
[pool limits and lifecycle](snippet-worker-pool.md). The pool itself does not enable
document caching.

## Parallel reads

An edited Snippet may opt into `execution: ParallelRead` in its source contract;
the editor provides the corresponding checkbox. Registered implementations use
`SnippetExecution.ParallelRead`. Enable this only for side-effect-free reads.
The supplied CMS client then rejects commands, including add-on commands. Normal
source publication freezes the declaration; existing plans retain their ordering.
See [dependencies, limits and failure behavior](parallel-snippet-execution.md).

## System object API

Both edited and registered Snippets can use the scoped server cms client.
Edited code uses cms or context.cms; registered implementations receive context.cms.
Queries and commands are allowed in Build, Request and preview. Preview writes
are real; completed commands survive later rendering/publication failure.
Await commands and reconcile uncertain outcomes through their own contracts.
There is no new public cms HTTP endpoint or general rollback/idempotency layer.
See the [system object API contract](system-object-api.md) and the
[English](../guide/en/README.md) / [Russian](../guide/ru/README.md) guides.

## Pagination

Pagination is bundled, along with the Pagination template (`ZaryaPagination`)
and the editable presentation chunks `ZaryaPaginationItem` and `ZaryaPaginationLink`.
Select that template and Request delivery to use query-dependent HTML without
client JavaScript. Or include the declaration and Each calls shown in the tab in
your own template. Snippets return data into `&as`; Each/chunks produce escaped HTML.

Inputs are `parentId` (current page), `page` (String, `1`) and `pageSize` (Number,
10, integer 1..100). There is no limit/offset request API. Direct children follow
URL parent identity, scoped by site and current page language. Redirects,
unpublished pages, other languages and grandchildren are excluded. Duplicate page
addresses use the first canonical path, ordered by path then URL identity.

Missing, nondecimal, negative and zero page values select page 1. Values beyond
the end select the last page. Empty results have zero totalPages and no links;
one page also needs no navigation. Links use `?page=N`; navigation contains first,
last and the current +/-3 window, at most nine links. A gap between numbers is
intentional. The active link exposes `aria-current="page"`. Unknown or duplicate
query parameters retain the public document boundary's rejection behavior.

The output contains `items` (pageId/title/path), `links` (page/href/current/ariaCurrent),
page, pageSize, total, totalPages and hasPages. Request Pagination automatically
adds optional String request.page defaulting to `1` to its frozen plan, unless
the site already declares a compatible String parameter. Other plans are unchanged.

Publication freezes only public summaries into private manifests/plans. Migration
0016 permits and validates the optional summary array without changing historical
receipts or old releases. Full-site publication refreshes it. Single-page
publication retains the selected release's other summaries, replacing only the
target page. Retained request plans preserve their prior lists until republished.
Requests use that captured catalog and prebuilt assets; they do not query drafts
or execute Build Snippets. After changing a child list, publish the site to refresh
its parent list. Preview without a published route catalog can display an empty list.

To create the explicit local demonstration after building and migrating:

```sh
node --env-file-if-exists=.env scripts/create-pagination-demo.mjs SITE_ID
```

This uses local inbound ports to create `/pagination-demo/` and 35 children,
publishes them and activates a full-site release. It refuses conflicting owned
paths, reuses its previously created pages and never deletes existing site data.
It is an opt-in demonstration, not seed content installed with the CMS.
