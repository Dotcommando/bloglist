# ADR 0047: Keep hook, site, source and media policies behind their owning boundaries

Date: 2026-11-01

Status: Accepted through the owner's abstraction-refactoring request.

## Decision

Preserve existing observable CMS behavior while removing four implementation
couplings. No persistence schema, migration, retention, access policy, publication
workflow or public REST/SDK response changes are introduced.

- HookRecipientsService owns recipient eligibility, scalar candidate filters,
  applied user-handler selection, add-on enable/disable capture, the per-hook
  binding limit and deterministic priority/identity ordering. An outbound source
  port supplies configuration, versions, connection state and code descriptors.
  MongoDB adapters retain technical sessions, scope/registry fences and atomic
  event recording. Restoration invokes the same selection using its transaction.
  Composition binds the service and adapters without selecting event consumers.
- ListSitesUseCase and ResolveSiteUseCase support trusted contextual reads.
  Contextual lists read only the selected site, including archives; contextual
  resolution checks access first and returns null for foreign or archived sites.
  Ordinary administrative lists and public hostname resolution keep their
  existing unscoped behavior. The CMS factory instantiates owning operations.
- IFrontendSource contains portable source identity, revision and source text.
  Local directories are resolved only between the file-location adapter and the
  Vite adapter, using siteKey and sourceId. File sources and managed elements no
  longer put local paths in domain snapshots. Authored relative CSS assets,
  browser module imports and source-root confinement remain supported.
- Media usage contracts contain a typed object identity, title, field, state
  and group. Persistence/rendering adapters report identities, never admin routes.
  Inbound REST and developer-API adapters project those identities to the
  existing editorPath response. The UI and SDK data shape remain compatible.

## Verification boundary

Focused behavioral tests cover selection and transaction-context translation,
contextual/unscoped site reads, actual production browser execution and local
assets, and exact REST/SDK media response shapes. Architecture regressions guard
the four removed couplings in addition to the existing import graph.
Integrated verification uses disposable databases and test servers only.
