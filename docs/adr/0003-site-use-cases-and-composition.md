# Site use cases and explicit repository composition

Status: Accepted

## Context

The owner requested implementation of the five inbound site operations and
NestJS modules connected through AppModule. The owner approved missing-site and
conflict errors and explicitly selected modules with a supplied repository
provider rather than a MongoDB implementation.

## Decision

Implement the existing contracts in `src/app/use-cases/sites`. Keep use cases
framework-independent and use their existing repository port. Introduce the
narrow `ISiteCreationValues` outbound port for initial identity and instant
generation; its system adapter supplies UUIDs and UTC instants. Domain entities
continue to own normalization and local invariants. Update and archive mutate
detached entities so failed workflows cannot mutate the repository's returned
object.

Use `SiteNotFoundError` for absent mutation targets and `SiteConflictError` for
occupied marks or domains. Domain validation errors and repository failures
propagate. Existing inbound inputs and results remain unchanged. Detailed
operation and failure semantics live in
[domain contracts](../arch/domain-contracts.md#implemented-site-operations).

`SitesModule.register` accepts a repository provider registered under
`SITE_REPOSITORY`, plus optional modules exporting its dependencies. It binds and
exports the five inbound tokens using factory providers; domain and application
code do not import DI tokens. `AppModule.registerSites` imports and re-exports
the configured module. The existing plain AppModule bootstrap remains valid
until a concrete repository is supplied. There is no implicit storage adapter.

This supersedes the empty-use-case requirement in ADRs 0001 and 0002 only for
sites. Other capabilities retain empty use-case files and unbound DI tokens.

## Consequences

Site workflows and module composition can be verified with deterministic fake
ports without a database or external services. No REST endpoints, database
schemas, migrations or environment settings change. Trusted administrative
context remains a caller prerequisite.

Uniqueness prechecks provide early failures; a supplied persistence adapter
must still enforce atomic uniqueness and translate conflicts into the agreed
application error. Persistence timestamps, durable writes and concurrent-write
guarantees remain adapter responsibilities. The existing repository contract
does not introduce version checks or promise stale-write detection.
