# ADR 0044: System object API and bilingual developer guide

Date: 2026-10-31

Status: Accepted for the API scope, access model, extension direction,
documentation requirements and Build/Request phase separation below. The later
owner-approved implementation clarifications are recorded at the end of this ADR.
The API implementation is described in [its contract](../arch/system-object-api.md);
Cloudflare remains the separate responsibility recorded in ADR 0045.

The subsequent Cloudflare implementation request is recorded in
[ADR 0045](0045-cloudflare-site-deployment.md); the earlier deployment discussion
below preserves the decisions made before that implementation.

## Context

The CMS has individual application ports, registered rendering Snippets,
constrained edited Snippets, an add-on runtime host and a scoped hook query/command
bridge. These do not yet form one developer-facing system object API.

The owner requires a consistent API and Russian/English documentation covering
its use together with templates, chunks, template variables (TVs), Snippets,
add-ons and hooks. Arbitrary restrictions or a new user-permission system are
not part of this request. All current administration users are administrators.

## Accepted decisions

### Scope and calling model

The API covers all of the following, rather than an initial pages-only subset:

- Sites.
- Pages.
- URLs and redirects.
- Templates, chunks and Snippets.
- TV definitions and page TV values.
- Files.
- Site add-on connections.
- Hooks.
- Administration users.

Snippets and add-ons use named operations grouped by the owning object type:

```typescript
const page = await cms.pages.get({ pageId });
const pages = await cms.pages.list({ parentId });
// Additional update fields follow the operation's agreed input contract.
await cms.pages.update({ pageId, /* changes */ });
```

This establishes the calling style, not complete method signatures. Results are
typed data; mutations use explicit application operations rather than mutable
ORM objects with a generic save method. The extension API does not expose core
collections or another capability's persistence as its business contract.

Read lists support limit, offset and sortby. This is the explicit owner decision
for this API even where existing repository conventions prefer keyset pagination.
Exact filters, sortable fields, sort syntax, defaults, result envelopes and error
contracts must be specified before implementation. No numerical pagination cap
is established by this decision. Existing administrative endpoints returning
complete lists are not silently repaginated by recording this new API design.

The API includes explicit draft and published-content reads. The owner accepted
the getDraft/getPublished direction and access to all existing content versions;
the concrete version/release selectors still need method-level contracts. This
does not introduce unlimited version retention or recover already pruned data.

### Commands and existing boundaries

Do not introduce RBAC, per-administrator roles or a new per-extension grant
management system for this API. Do not classify all Snippets as read-only merely
because they are Snippets. The API includes queries and commands; how commands
execute within Snippet lifecycles is not yet decided below.

This design direction supersedes the assumption that a future shared Snippet API
must inherit the blanket read-only scope of the original rendering-loader
contracts in ADRs 0007, 0008, 0024 and 0036. It does not change the current worker
implementation or grant it new capabilities by documentation alone. Existing
hook grants are not automatically generalized into a new permission subsystem.

Site ownership, publication visibility, private data handling, authenticated
administrative entry points and the business rules of owning operations remain
requirements. Accepting draft reads does not itself publish drafts or credentials.
Object coverage does not define every possible CRUD operation or override an
explicitly deferred lifecycle such as add-on deletion. New operation inputs,
outputs and failure semantics require agreement before implementation.

### Add-on extensions and composite operations

Add-ons may extend the API with methods for their own objects. The owner also
identified composite operations combining changes to an add-on object and a CMS
object as a desired capability. These belong to the application operation owning
the combined outcome and use explicit cross-capability ports.

A composite method must state its atomicity and failure/recovery contract before
implementation. Sequential calls are not an all-or-nothing transaction. Database
transactions, when required and supported by the participating operations, stay
behind application ports; database sessions do not enter Snippet/API contracts.
External effects and publication artifacts need their own declared recovery
semantics. This decision does not invent a generic distributed transaction API.

### Documentation

Provide a Russian and English developer guide covering API operations, templates,
chunks, TVs, Snippets, add-ons, hooks and their interactions. Include runnable
examples, results, error behavior and relevant corner cases, including absence
versus null/defaults, content versions, repeat execution and publication effects.

For every documented object, describe the actual relevant persistence indexes,
their field order, uniqueness and scope, and show API filters/sorts that use them
well. State which combinations may scan or sort more data. Explain that deep
offsets can remain expensive even with a matching index. Where reads use release
artifacts or merged catalogues rather than MongoDB queries, document that path
instead of implying that a collection index accelerates the whole operation.

Index descriptions must follow the applicable migrations/adapter queries. Label
reasoned cost guidance as such; do not present unmeasured recommendations as
verified query plans or performance guarantees. No new index or benchmark result
is implied by this documentation decision.

The proposed guide layout is docs/guide/ru and docs/guide/en with matching paths,
getting started, concepts, task guides, reference, recipes and troubleshooting.
Reference separates server API calls from HTTP endpoints. Cross-feature recipes
link to the relevant reference pages. docs/arch remains implementation/contract
documentation; docs/adr retains architectural decisions and their history.

## Accepted Snippet phases and CDN publication direction

The owner's goal is to deploy as much static content as possible to a CDN and
minimize request-rendered pages. In the follow-up, the owner accepted separating
Build and Request execution, reusing the Snippet phase already present in the
engine. Detailed command behavior and preview effects remain under discussion.

Build on the existing independent Build/Request, Static/Request HTML delivery
and None/Api browser-interaction choices:

- Build computes values when a page artifact is built for publication. Values
  are frozen into that output until the page is rebuilt. This is not once per
  Page lifetime: creation, preview, republication and failed/repeated builds are
  different executions. Retained artifacts need not be rebuilt in an incremental
  release. A CDN hit never runs this server code.
- Request computes values for an origin-rendered document request using the
  selected release plan and prebuilt assets. A cached response served without
  contacting the origin does not execute server Snippets, so caching and
  "every display" cannot be treated as equivalent.
- Static HTML with browser API interaction keeps the document static while a
  declared widget loads live data or submits a command. This can avoid making
  a whole page dynamic. It does not claim that embedded Request Snippets already
  work as independently fetched fragments; such a feature needs its own contract.
- An action that must happen because a Page is created belongs to an explicit
  creation operation/composite or page-created hook, with defined idempotency and
  recovery, rather than relying on rendering as an exactly-once trigger.

Changing a value read during Build does not update deployed HTML on its own.
Rebuild triggers and any dependency tracking, including list membership changes,
must be explicit. After a successful rebuild, CDN document updates/invalidation
must follow the selected release; switching the CMS release pointer alone does
not prove that independently hosted CDN documents have been replaced.

Commands do not become forbidden merely by selecting a phase. Their effects on
preview, repeated builds/requests and failed publication must be agreed. A failed
build does not automatically roll back an already committed business command.
No new cache TTL, deployment provider, automatic rebuild mechanism or preview
write policy is approved by accepting this phase separation. Cloudflare hosting
is a deployment feasibility question, not an authorization to deploy or a
decision to replace the current Node.js/MongoDB backend.

### Follow-up deployment usability requirement

The owner requires one stable Cloudflare Worker setup and a repeatable update
process. Internal release IDs must not require manual Wrangler configuration
changes, selection of a new upload path or recreation of the Worker after every
publication. The exact export/upload mechanism is not yet selected or implemented.
A fixed export directory is one proposed mechanism, not an existing feature.

Existing incremental publication assembles a complete new release by copying
unchanged documents, assets and private Request plans from the selected base.
It does not serve those pages by fetching older deployments. Retained static
HTML may keep old release-qualified asset URLs; the new release copies the assets
and exports aliases for those URLs in _redirects. Keeping assets available for
already open old browser documents is a separate compatibility concern. Neither
case requires operators to assemble the current site manually from old releases.

## Implementation consequences

Implement against agreed application contracts in the existing layer-first
architecture. Reuse existing operations and preserve their invariants; add
explicit contracts where the accepted surface has no corresponding operation.
Use fixed-version SDK/package artifacts for add-ons, with no sibling source
imports. Keep the clean distribution's business registries empty under ADR 0037.

This task records decisions and execution advice only. It does not implement API
methods, change runtime behavior, install an add-on or deploy to a CDN.

## Owner-approved implementation follow-up

The original discussion above records the then-open decisions. The owner
subsequently approved these concrete first-version contracts:

- Expose the existing application operations of the listed object families through
  the server cms facade; do not infer additional CRUD or deferred lifecycles.
- Permit commands in Build, Request and preview, including real preview writes.
  A committed command survives later rendering or publication failure. Each command
  owns its idempotency and reconciliation; rendering is not an exactly-once trigger.
- getDraft reads the draft. getPublished without a selector reads the active release;
  releaseId selects one ready immutable release and pageVersionId one retained page
  publication. The selectors are mutually exclusive.
- Lists use limit 50 and offset 0 by default, without a numerical upper cap.
  sortby is an ordered array of field/direction pairs; results are
  {items, total, limit, offset}, with catalogue metadata retained separately.
  Unsupported filters/sorts are errors.
- Provide code-owned API extensions for add-ons and keep the reusable synthetic
  add-on in the separate zarya-addon-synthetic project. Fixed SDK/runtime artifacts
  and isolated tests preserve the clean distribution.

The owner additionally explicitly authorized private CMS_API/CMS_SNIPPET_API
provider registration in PublicHttpModule for Request Snippets and add-ons.
This does not register a public endpoint/controller or export a network operation.

The implementation uses existing owning use cases with scoped extension authority,
a JSON-only worker bridge and SDK 0.4.0 data contracts. New release builds retain
complete private page snapshots so explicit release reads do not substitute
drafts or the latest publication. Legacy releases without those snapshots fail
explicitly for complete-content reads; retention is not extended.
The [bilingual developer guide](../guide/en/README.md) documents actual operation
contracts, indexes/read paths, repeated execution and failure effects.
