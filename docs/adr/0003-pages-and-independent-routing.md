# ADR 0003: Separate pages and URLs using the Bloglist baseline

Date: 2026-10-24

Status: Accepted direction from the owner; new operation contracts remain to be agreed.

## Context

Bloglist separates page content from URLs and supports SEO clusters. Zarya needs
compatible page/routing foundations while its first psychologist site does not
need clusters. An established URL must remain manageable after its page is removed:
it can redirect or serve a replacement page without losing the URL's identity.

## Decision

- Adapt Bloglist's `pages` and `routing` models and relevant contracts into Zarya's
  existing architectural layers when implementation is requested. Do not import
  sibling-project source at runtime or copy unrelated cluster functionality.
- Keep `Page` and `Url` as separate entities/capabilities, with distinct `pageId`
  and `urlId`, trusted `siteId`, independent lifecycle and explicit references.
- Preserve the URL model's PAGE/REDIRECT distinction, parent URL relationship,
  history and configured 301/308 redirect semantics. Resolve public links through
  routing; do not derive permanent page identity from a slug or filesystem path.
- Preserve the ability for a page to have `clusterId = null`. Do not require a
  cluster provider/module to create or render ordinary Zarya pages. Future Bloglist
  integration can enable cluster relationships through explicit extension ports.
- Manage URL disposition explicitly during page archival/removal. Support a
  retained URL becoming a redirect or being rebound to a replacement page through
  separately agreed operations. Do not implicitly delete URLs or orphan targets.
- Keep page publication state, route changes and release activation distinct.
  A publication workflow activates a coherent page/route snapshot. Static hosting
  must apply real redirect rules or use an explicit routing delivery adapter;
  a redirect must not become a successful content HTML document by accident.
- Record scenarios in `scenarios/`. The initial scenario is
  [the psychologist's games site](../../scenarios/001-psychologist-games-site.md).

## Source review and adaptation boundaries

Reviewed Bloglist sources on 2026-10-24:

- `src/domain/pages/page.ts` and page create/update/archive contracts.
- `src/domain/routing/url.ts`, URL history and routing repository/contracts.
- `src/infra/pages/pages.module.ts` and page relationship validation.
- Routing ADR 0004, page ADRs 0005/0006 and `docs/arch/domain-contracts.md`.

The reviewed Page already supports a nullable cluster reference, but its NestJS
module still requires a cluster lookup provider. Zarya must deliberately adapt
composition rather than introduce a dummy dependency for cluster-free sites.
The existing Page has no template/media bindings; those are Zarya extensions to
agree. Bloglist's business PageType values do not replace Zarya's independent
Static/Request delivery policy.

The reviewed routing operations cover initial address assignment, changing a
page's address with an atomic old-address redirect, exact path lookup and history.
They do not already expose reassigning a retained URL to another page or a complete
page-removal disposition workflow. Page archive only changes stored page status;
it does not switch URLs or published output. Define those additional contracts
and their atomicity/failure behavior before implementing them.

## Consequences

The first site needs no SEO clusters and still supports later hierarchical URLs.
Game pages and future event reports can move or be replaced without conflating
their identity with an address. Cross-site targets, redirect cycles, stale writes,
canonical URL selection and affected child URLs need explicit workflow checks.
No code is copied or implemented by this documentation decision.
