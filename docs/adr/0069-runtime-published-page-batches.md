# ADR 0069: Narrow published-page batch access for runtime add-ons

Date: 2026-11-09

Status: Accepted through the owner's Events batch-query implementation request.

## Decision

The generic CMS offers FindPublishedPages through its local/public composition
and the additive version-1 runtime-host capability
`publishedPages.findPublished(siteId, pageIds)`. It returns only the requested
published page identities, in input order. It selects one current active release,
retains the existing full publication-store integrity checks and rejects foreign
or unavailable publication metadata. Redirects do not create page eligibility;
draft existence is never a substitute. Empty input returns empty output.

The operation accepts at most 128 distinct nonempty identities. This is an
internal batch/admission count, not public document query validation or business
pagination. Membership is not retained across operations: publication switches,
restoration and missing publication remain visible on the next call.

The operation lives in the publication application layer behind an inbound port;
composition injects activation/storage ports and adapts its input/output for the
runtime host. No Events type, repository, collection, registration or seed enters
the clean distribution. New add-ons can consume this narrow capability without
understanding CMS release entities or accessing CMS persistence.

The existing technical host fields remain for older immutable installed runtimes.
The new field is additive; runtimes requiring it declare CMS 0.11.0 as their
minimum and explicitly check availability. SDK 0.4.0 runtime dependencies and
the package envelope remain unchanged. The Events-owned use case separately
enforces add-on access, all requested pages and its own per-page pagination.

## Verification

Fake-port regressions cover one captured release, full-verification invocation,
input bounds, draft separation and foreign/corrupt metadata. The isolated
publication/restore composition test resolves the operation through AppModule.
The site installation verifies the separately packaged Events runtime through
real composition and an isolated database. No deployment is implied.
