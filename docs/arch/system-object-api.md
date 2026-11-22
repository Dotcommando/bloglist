# System object API

The accepted scope and follow-up policy are in
[ADR 0044](../adr/0044-system-object-api-and-bilingual-guide.md).
Developer guides are [English](../guide/en/README.md) and [Russian](../guide/ru/README.md).

## Composition and authority

CMS_API is a private server API factory in local AppModule and PublicHttpModule.
CMS_SNIPPET_API binds the selected site and the trusted Snippet identity.
The HTTP composition registers no new controller, route, authentication bypass
or module export for cms. Public documents still resolve trusted site mappings;
unregistered /api paths remain rejected by the document dispatcher.

The extension access adapter checks captured site identity, actor identity and
site existence for owning operation access ports. It neither imports nor
manufactures local-operator authority. Site-owned commands/read references retain
their normal ownership/version/domain checks. Global administration objects stay
global under the owner-approved trusted-code model, without a new role/grant system.

The API service invokes grouped inbound operation contracts. Framework-free ports
retain inward dependencies. infra/cms composes existing use cases with real
adapters and scoped access; it does not provide alternate business implementations
or fake storage. Optional unconfigured media fails explicitly on file operations.
Datastore pools are shared through the existing connection, not new backends.
Contextual site list/resolution is implemented in ListSitesUseCase and
ResolveSiteUseCase. Lists read only the captured site (including archives);
resolution checks access first and returns null for foreign or archived sites.
Unscoped administrative lists and public resolution retain their existing behavior.

## Data and lists

CmsApi is derived from existing inbound operations; SDK 0.4.0 exposes only portable
data declarations. The declaration generator runs from
scripts/generate-cms-contracts.mjs, followed by the root ESLint policy.
No SDK declaration imports core source, framework, repositories or domain classes.

Results detach entities through snapshots; UTC Dates become ISO strings,
bigints decimal strings, and binary content byte arrays. Omitted object fields
are omitted, null/false/zero remain values. Input instants for TV concurrency
are translated back at the boundary. Inputs cannot override siteId/actorId/signal or the kind selected by an element group.
Business kind selectors for hooks/URLs remain normal owning-operation inputs.

List defaults are limit 50, offset 0 and no explicit sort. Positive/nonnegative
safe integer checks apply; no numerical upper pagination cap is imposed.
Unsupported fields and directions reject before invoking a list. Filtering is
scalar equality, followed by deterministic sorting, ascending identity tie-break,
and slicing. Metadata from composed catalogues remains separate from items.
Current source lists are materialized; administrative-user cursor pages are
fully gathered. Existing REST/owning-port lists are not repaginated by this API.

## Published content

pages.get/getDraft reuse the draft operation. getPublished selects one current
active release per call unless releaseId or pageVersionId is explicit. The two
selectors are mutually exclusive. Missing selections return null; legacy routed
releases lacking complete snapshots return an explicit NotFound rather than
substituting a current draft.

Frontend builds add private content/pages/<page-identity-hash>.json artifacts for
routed published pages. Normal manifest checksums cover them. Single-page release
assembly replaces only its target snapshot and retains the others. Routing-only
releases retain the captured content; reads still require that the selected page
has a published document route. Public asset delivery cannot return these files.

Retained page-version IDs hash canonical content and are stable while that
snapshot exists. ListPageVersions/GetPublishedPage use the owning publication port
behind a dedicated read capability. Retention remains three; restore retains its
existing guarded positional selector and draft-only effect. No migration or
unlimited revision history is introduced.

## Snippet and add-on bridges

Edited workers exchange JSON messages with a host-validated operation path:
two components for core calls and four for extensions/addon/object/method.
Only own registered methods can be invoked. The VM contains a realm-local proxy,
not callable host objects. Node, environment, filesystem, imports and arbitrary
network access remain unavailable. Code stays frozen in private Request plans.

Queries and commands work in Build, Request and preview. Completed commands survive
later failures, invalid output and publication errors. There is no encompassing
transaction or hidden replay; in-flight writes can outlive a timed-out worker.
Use each owning command's recovery/idempotency contract.

An add-on receives host.cms.forSite with its code-owned addonKey. The connection
access class is rechecked for every operation. Runtime/static registration can
supply a version-1 cms descriptor; the registry exposes
cms.extensions[addonKey][objectKey][method]. Each operation declares Query/Command
and its existing AddonOperationAccess class. New/public operations require enabled
connections; explicit retained maintenance survives disable. Business write fences
and cross-capability transaction guarantees remain the owning operation's task.

The synthetic add-on source and fixed SDK package live in the separate
zarya-addon-synthetic project. Core registries remain empty. Integration tests
receive its built artifact directory only through the explicit
ZARYA_TEST_SYNTHETIC_ADDON_DIRECTORY setting and install it under an isolated
temporary test root/database. Generic runtime transfer tests also use synthetic
packages, never site/business packages or data.

## Verification boundary

Focused tests cover data/list/identity errors, selector semantics, worker phases,
preview commands, retained effects, scoped package registration, real composition,
HTTP non-exposure, private snapshots, incremental replacement, own add-on
persistence and disable behavior. Tests use disposable databases and close their
test servers; they do not start an owner application or deploy anything.

The bilingual guide's index catalogue follows actual migrations and queries.
Cost descriptions are reasoned, not measurements. CDN rebuild triggers, general
distributed transactions, a new permissions subsystem and public cms REST
endpoints are not added.
