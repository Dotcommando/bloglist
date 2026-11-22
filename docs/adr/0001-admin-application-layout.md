# ADR 0001: Backend in src and Svelte administration in admin

Date: 2026-10-24

Status: Accepted by the owner.

## Context

CMS Zarya needs an administration interface while preserving a file-based,
minimal-change integration with Bloglist's existing NestJS layer-first backend.
The administration frontend has a different build/runtime from generated public
site templates and chunks.

## Decision

- Keep the NestJS backend and rendering engine under root `src/`, preserving
  sibling `domain`, `app`, `ports`, `adapters` and `infra` layers.
- Place the administration application under root `admin/`. Use Svelte, Vite,
  Bits UI and strict TypeScript with its own dependencies and build configuration.
- Use npm workspaces, one root lockfile and a shared root ESLint policy extended
  with appropriate Svelte and environment-specific parsing/global settings.
- Communicate through explicit REST/JSON APIs, normally `/api/admin/*`; browser
  code does not import server implementations or replace server authorization.
- Build admin assets into `admin/dist/`. The same server can serve them under
  reserved `/admin/`; separate hosting is optional and needs no second backend.
- Keep site content in `sites/` and published site releases separate from admin
  output. Public-site rendering does not depend on serving the admin.
- Apply the template/chunk CSS extraction pipeline to generated public sites.
  Svelte/Vite owns the administration component build; shared authored CSS units,
  responsive conventions and accessibility rules also apply to the admin.

## Consequences

The backend retains Bloglist-compatible paths. The admin can be copied and built
as one separate folder without mixing Svelte components into backend adapters.
Its dependencies and assets do not become dependencies of each published site.
API contracts and coordinated build scripts must preserve the application boundary.

This records an architectural decision; application scaffolding and implementation
are separate tasks. No storage provider or file-processing design is selected by
this decision.
