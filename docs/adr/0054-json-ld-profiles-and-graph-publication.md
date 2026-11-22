# ADR 0054: JSON-LD profiles, shared objects and graph publication

Date: 2026-11-02

Status: Accepted through the owner's JSON-LD design discussion and explicit ADR
request. Implemented in CMS 0.10.0; excluded from CMS 0.8.0.
Implementation contracts and upgrade requirements are recorded in
[Markdown and JSON-LD publication](../arch/markdown-and-json-ld.md).

Scheduling amendment, 2026-11-02: the owner authorized reserving CMS 0.9.0 for
deployment and installation improvements and moving the GEO capabilities to
0.10.0. See [ADR 0055](0055-provider-independent-deployment-and-installation.md).
The behavior and acceptance requirements below remain unchanged.

## Context

Zarya already has page metadata, site-owned TV definitions assigned to templates,
per-page TV values and prepared Snippet data. JSON-LD should reuse these sources
without requiring a second manually maintained copy of each page's content.
Organizations and people can be shared by many pages and need their own reusable
identity and data. A profile definition and an instance of the object it
describes are separate concepts.

Page, URL and described entity identities are also separate. A page's address
can move, become a redirect or be removed without changing its content identity.
An organization's identifier must not accidentally become the address of its
current About page. JSON-LD relationships form a graph, not a parent/child tree.

References: [TVs](0040-template-variables.md),
[page metadata](0023-page-slugs-and-seo-fields.md),
[URL selection](0030-searchable-url-selection.md),
[routing releases](0029-immediate-url-changes-and-address-removal.md),
[public availability](0033-page-url-and-public-availability.md),
[public delivery](0008-public-delivery-and-page-restoration.md), and
[protected previews](../arch/rendering-element-editing.md).

Standards references: [JSON-LD 1.1 node identifiers](https://www.w3.org/TR/json-ld11/#node-identifiers),
[Schema.org url](https://schema.org/url),
[Schema.org sameAs](https://schema.org/sameAs), and
[Google structured-data guidelines](https://developers.google.com/search/docs/appearance/structured-data/sd-policies).

## Decision

### Profiles and data ownership

Add reusable, site-owned structured-data profiles. A profile defines the
Schema.org type, named node roles, property mappings and relationships required
to describe an object. It can be assigned to multiple HTML templates; a template
can have multiple profiles, such as Article and BreadcrumbList. Visual template
composition and semantic classification remain separate responsibilities.

Property sources include existing page fields, effective TV values, prepared
public Snippet values, explicitly configured constants and typed object
references. Profiles reference existing field definitions rather than cloning
their values. Missing additional page inputs may appear as a named group in the
TV editor, retaining the owning TV definition/value semantics. Existing Text,
Markdown, Image and File behavior is preserved; new input types require explicit
contracts rather than encoding every number, date, list or reference as text.

Provide site-owned shared objects for reusable Organization and Person data.
The site's public owner can be an organization or a person. Shared objects can
hold applicable names, descriptions, public contacts, identifiers, logo/image,
addresses and external identity links. They are not administrator accounts and
do not expose account data. Existing page-backed objects, such as an article,
are generated from their page and profile binding; do not require duplicate
standalone records for them.

Mappings construct typed JSON values and references. They are not raw JSON text
with string interpolation or another arbitrary expression/TypeScript engine.
Profiles do not query persistence or call integrations. Reuse prepared values
and public media view models; do not emit private originals or admin URLs.

### Administration workspace

Add a JSON-LD section with switchable Profiles and Shared objects lists in the
left drawer. Both are flat lists, following the existing hooks-style list
interaction. No profile inheritance tree or graphical node editor is required.
Relationships do not imply drawer nesting. Generated page objects remain in the
Pages workspace rather than being duplicated in Shared objects.

The profile editor shows its type/node roles, property-to-source mappings,
relationships and assigned HTML templates. The shared-object editor shows its
type, values and references. Template editing exposes assigned profiles; page
editing exposes their required inputs and reference choices. Profile bindings
determine what is generated, not which duplicated JSON source the author edits.

Use the existing responsive drawer/workspace conventions, keyboard/focus
behavior and English/Russian localization. Preserve unsaved editor input when
switching context or reporting validation errors.

### References and URL selection

Store typed internal references and resolve their public serialization through
the graph builder. Users select meaningful targets; ordinary reference fields
do not ask them to type an @id string.

| Property or intent | Editor selection | Stored target |
| --- | --- | --- |
| publisher, author, provider | Compatible organization/person | Shared-object identity, or page-backed identity and node role |
| mainEntityOfPage | Current page by default | Current-page context and WebPage role |
| url: page's current address | Page of this site | pageId, resolved through the selected release's routing |
| url: exact site address | Specific URL of this site | urlId, retaining the exact-address intent |
| url: external address | Explicit external address | Validated absolute URL |
| sameAs | External identity page | Validated external URL identifying the same entity |

For an address property, expose a source selector: Page of this site, Specific
URL of this site, or External address. Show the selected page/object label and
the resulting public URL or generated @id as a read-only explanation. Page
selection and exact URL selection must remain distinguishable after saving.

Reuse the search/popover interaction from ADR 0030, including keyboard selection,
bounded suggestions, loading, empty and retry states. Entity and page pickers
have their own authorized queries and compatible-target filters; do not reuse
redirect-specific search semantics as an implicit contract for all references.

All internal targets belong to the authorized site. Show missing targets,
unpublished page addresses, redirects, deletion and rebinding states explicitly.
An exact URL reference must not silently become a reference to whichever page
later occupies that address. A page reference follows that page's selected
public route. Neither kind falls back to a draft or another site.

### Identity and graph assembly

Each shared object has a stable internal identity; page-backed nodes are
identified by page identity and their bound node role. A central identity policy
generates absolute public @id values consistently across profiles and pages.
For example, an owner organization can use https://example.com/#organization
while its url property points to the current About page. A fragment identifier
does not require a separate routing record or an HTML element of that name.
External sameAs addresses are separate from this site's own node identifiers.

Assemble one per-document object with @context and @graph. Profiles contribute
typed nodes; references serialize as objects containing @id. Collect only the
nodes needed to describe the page and its related public objects. Do not traverse
the whole site or fetch remote identifiers during rendering.

Deduplicate nodes by their resolved identity. Identical contributions can share
a node; incompatible values must produce an actionable conflict rather than
last-writer-wins output. Multiple types or values require explicit compatible
mapping semantics. Cyclic references are valid and must not cause recursive
expansion; use identity-based collection. No graph database, RDF inference engine
or universal editor for the entire Schema.org vocabulary is required.

### Rendering, publication and routing

Safely serialize the graph into an application/ld+json script element in the
server-produced HTML. Escape for the HTML script context, including values that
could close the element. Do not execute the graph as JavaScript or interpolate
unescaped source strings. Describe actual public page content; do not invent
ratings, prices, identities or other claims to populate an optional property.

Static HTML and its graph are published together in the same immutable release.
Request rendering uses the captured profile/object configuration, frozen Build
values and the same resolved public Request data as HTML. Do not execute a
Snippet again for JSON-LD, compile profiles/assets on a public request or consult
working drafts. A required loader or graph consistency failure follows explicit
failure semantics rather than exposing a partial success document.

Owner decisions, 2026-11-02: publication involving changed shared profiles or
objects also republishes all affected pages using their published content, without
publishing unrelated drafts. An unavailable required internal reference blocks
publication and offers a way to resolve it in the current flow. Deleting a shared
object is allowed and offers correction of dependent pages; the previous active
release remains intact until successful publication. Exact URL references retain
an address that becomes a redirect and display a warning. When the site's primary
domain changes, migrate the site's JSON-LD identifiers to the new domain.

Draft saves to profiles, shared objects or page inputs do not mutate an active
release. Full-site and incremental publication must capture coherent shared
object/profile versions and account for their dependent pages. A publication
failure leaves the previous active release intact; no draft is promoted through
an unrelated page's publication.

Extend routing-only release preparation to update route-derived JSON-LD values
from captured published inputs when addresses move. Preserve entity identities,
published content, profile/object snapshots and frozen Build data; do not rebuild
templates/assets or execute Build Snippets to update an address. Keep old
immutable releases unchanged. Domain/origin changes require an explicit identity
migration policy rather than deriving identifiers from an incoming Host header.

Provide authorized inspection of generated JSON-LD in page preview, identifying
published versus draft output and reporting invalid mappings, references and
graph conflicts. Reuse the existing private preview boundary, no-store/noindex
delivery and input-preserving error handling. Inspection does not save or publish
implicitly. This is separate from the Markdown action in
[ADR 0053](0053-markdown-representations-and-editor-preview.md).

### Initial scope and implementation boundary

Owner amendment, 2026-11-04: provide five built-in creation presets: Person,
Organization, WebPage, Article and Service. They initialize editable drafts
through the existing catalog contract and never seed site content. Selecting
an author/provider remains explicit. This adds no inbound operation,
persistence schema, publication gate or search-result guarantee.

Start with WebSite/WebPage, Organization/Person shared objects and an Article
profile to verify the complete graph workflow. Other types/profiles can follow
actual site needs; this ADR does not authorize seeding business objects,
installing add-ons or copying site content into the clean CMS distribution.

Before implementation, agree the operation contracts, failure results and
concurrency guards for profile/object editing, assignment, references, inspection
and publication. Finalize typed field requirements, identifier generation,
origin-change behavior, missing/redirect/rebound reference outcomes, deletion
policy and the publication scope for changed shared objects/profiles. Define
supported Schema.org mappings and validation separately from Google's
feature-specific rich-result eligibility. No search-result appearance is implied.

New persisted definitions, values and bindings must retain site ownership and
participate in the relevant dump/restore and publication contracts. Add explicit
versioned schema/index migrations after the 0.8.0 baseline under
[ADR 0051](0051-cms-080-schema-baseline.md); do not rewrite that applied baseline.
This documentation task adds no implementation, migration, live data or version
bump.

## Acceptance criteria for 0.10.0

- Assign a profile to several templates and several profiles to one template.
  Page fields and TVs supply values without duplicate manual content; shared
  organizations/people are selected once and reused by references.
- Verify flat drawer lists, editor mappings/assignments, authorized searchable
  pickers, source modes, generated-identifier display, localization,
  keyboard/focus behavior and responsive layouts.
- Build a page graph containing WebSite, WebPage, Article, publisher and author.
  Verify stable identities, node reuse, cycles, explicit conflict reporting,
  typed values and safe serialization of quotes and closing-script payloads.
- Verify page-following versus exact-URL references through moves, redirects,
  deletion, rebinding and missing/unpublished targets under the agreed policies.
  Deny foreign-site targets and keep private data/media out of public output.
- Static and Request graphs match the selected published content and release.
  Reuse Request results once and frozen Build values; profile/object edits and
  preview do not alter public output. Cover incremental/shared dependencies,
  routing-only updates, failed activation and release changes during requests.
- Verify private inspection, validation failures, stale edits, version capture,
  migrations/indexes and dump/restore behavior in isolated synthetic fixtures.

The original acceptance of this ADR executed no runtime, schema migration,
rich-result validation or deployment checks. Implementation and upgrade behavior
are described in the linked publication contract.
