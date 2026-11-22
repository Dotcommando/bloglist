# ADR 0024: Snippets and bundled Pagination

Date: 2026-10-27

Status: Accepted by the owner's Snippets and Pagination request.

Data loaders are called **Snippets**, including in administration and new public
documentation. Existing loaderId/loaders/LoaderPhase bindings remain compatible.
The owner's follow-up explicitly requires a server-code editor, superseding the
prior prohibition on CMS-stored executable snippets within this boundary.

Extend the existing rendering element workflows with Snippet kind. A Snippet has
TypeScript function-body code, declared input parameters, one typed output
contract and allowed Build/Request phases. Creation assigns a site/kind ordinal;
name aliases and exact numeric keys can be used in bare named tags. Its result
binds to mandatory &as and emits no HTML; chunks render the returned data.

The Snippets section is a peer of Pages, Templates and Chunks, with the same
code-editing buffers, version guards, complete private backups, preview and
explicit Save draft / Save & apply behavior. Migration 0017 extends the existing
rendering element and ordinal validators without rewriting previous receipts.
Backups live under elements/snippets/. Built-in Pagination can be adopted into
a site's editable catalog; custom snippets can be created in administration.

Publication transpiles server TypeScript and freezes compiled code, contracts
and public page summaries into private release plans. Request execution never
transpiles code, reads draft implementations or rebuilds assets. Code executes
in a separate worker/VM with JSON inputs and scoped public context, no injected
Node/Nest services, process environment, imports, filesystem or network APIs.
A deadline terminates workers and output must satisfy the typed JSON contract.
Workers/VM are a constrained execution mechanism for trusted global
administrators, not a claim of an operating-system security boundary for hostile
code. Markup itself cannot evaluate code or locate services.

Pagination ships as editable source in the base rendering library alongside its
presentation template/chunks. Site authors can change its code and presentation
under the same explicit publication boundary.

Pagination accepts `parentId` (current page by default), `page` (decimal string,
default `1`) and `pageSize` (integer 1..100, default 10). Children are direct URL
children of the parent's canonical address in the same site and language; Page
identity remains independent of URL hierarchy. Canonical addresses are selected
by path and URL identity, and items are ordered by path then page identity.
Redirects and pages without published public addresses are excluded. Invalid,
zero or negative page strings select 1; oversized page numbers select the last
page. Empty lists have page 1 and no navigation. Navigation uses `?page=N`, with
first/last and a bounded window around the current page (at most nine links).
No public limit/offset inputs are introduced.

Request templates explicitly forward `[[+request.page]]`; the standard example
uses ``[[!Pagination? &page=`[[+request.page]]` &as=`pagination`]]`` and the
ZaryaPagination template/presentation chunks. Only plans using Request Pagination acquire its default
String request parameter. Unknown/duplicate query parameters retain existing
HTTP validation. Query-dependent HTML requires Request delivery.

The publication capability freezes a public page summary catalog into the private
release manifest and plans. It contains only site/page/URL identities, parent URL
identity, title, language and path. Full-site publication refreshes the catalog;
single-page publication replaces only that page's summaries and retains the
selected release's other summaries. Old releases without a catalog remain valid
and contribute no inferred metadata. Retained plans stay frozen. Requests never
read drafts, select a different active release or rebuild assets.

The local demonstration creates a parent and 35 direct URL children, publishes
them and activates an explicit full-site release. It is separate from the bundled
implementation, so installing the CMS does not create demonstration content.
