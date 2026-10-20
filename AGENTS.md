# Bloglist CMS Repository Instructions

Design for worldwide use. Store instants in UTC. Use configured IANA time zones
for user-facing display and business calendars; never hardcode the owner's
location or depend on the server's local time zone. Date-only values remain
calendar dates.

## 1. Scope And Development Model

Build a CMS inspired by MODX for managing many domains and related websites,
primarily blogger directories and content sites. Sites may share structure while
varying in content, templates and configuration. Support static-site publication
alongside dynamic endpoints, authentication, authorization and purchased access.
One backend serves multiple sites; a site is not a separate backend deployment.
Treat tenant isolation, publication correctness and access entitlements as
business requirements.

Use npm, Docker, strict TypeScript, NestJS and MongoDB with Mongoose. Preserve
Hexagonal Architecture with layer-first directories in the shared backend. Do not
split capabilities into microservices without a concrete requirement.
Do not scaffold unused services, integrations or directories.

Pin all direct dependency and devDependency versions exactly in `package.json`;
do not use ranges, `^`, `~`, wildcards or floating tags. Commit `package-lock.json`
and use `npm ci` in CI and Docker builds. Dependency upgrades are deliberate
changes with compatibility verification. Pin the Node.js/npm toolchain and Docker
base/service images to explicit versions; never use `latest`. Use Docker and
Docker Compose for reproducible application and local dependency environments.

Development follows explicit owner requests and agreed observable behavior.
Do not require plan files, an active-plan pointer, step status tracking or
plan maintenance. Resolve routine choices from repository conventions and the
authorized task. Ask only when a material ambiguity cannot be resolved from
available context. Do not perform unrelated work merely because it is nearby.

This file owns durable development and architecture rules. Public architecture
decisions belong in `docs/adr/`, boundary audits in `docs/audits/`, and technical
documentation in `docs/arch/`. Record deliberate architecture changes in an ADR;
a task cannot silently override these rules. Explicit owner instructions take
precedence over repository conventions.

Before implementation, read applicable `AGENTS.md` files, relevant specifications,
ADRs, contracts and fixtures. Inspect the existing code and identify the affected
use cases, observable success/failure behavior and appropriate verification.
Work in coherent, reviewable increments without creating planning artifacts.
Keep credentials, private evidence and unrelated local material out of public
documentation, commit messages, PR descriptions, CI logs and artifacts.

## 2. Architecture And Responsibility Boundaries

Follow Hexagonal Architecture / Ports & Adapters. Dependencies point inward:

- `domain` owns business rules and state transitions, independent of frameworks.
- `app` owns application use cases and their orchestration.
- `ports/inbound` defines operations offered by the application; use cases
  implement these contracts and inbound adapters call them.
- `ports/outbound` defines capabilities required by the application;
  outbound adapters implement these contracts.
- `adapters/inbound` contains HTTP/gRPC controllers, GraphQL resolvers and message
  consumers. They translate protocol inputs/outputs and invoke use cases; they
  do not own business rules or workflow orchestration.
- `adapters/outbound` contains persistence adapters, service clients and publishers.
- `infra` contains configuration, bootstrap and composition: NestJS modules,
  providers and DI wiring. Concrete integrations belong in adapters.

`ports`, `app` and `domain` are sibling directories. Imports follow
`ports -> domain`, `app -> ports/domain`, and `adapters -> ports/domain`;
`infra` wires all layers. `domain` does not import ports, and ports do not import
`app`, adapters or `infra`. Inbound adapters call inbound interfaces, not concrete
use-case classes. Define operation contracts in ports and business types in
domain so an interface never needs an implementation import.
Adapters may import capability-owned DI token files from `infra` for framework
injection; these files are leaf constants with no implementation imports. This exception
does not permit adapter imports of composition modules or concrete use cases.

### Source organization and extension principles

Organize each backend application by architectural layer first. Domain,
application, ports, adapters and composition are sibling layers under the
application source root. Within a layer, group code by its role and owning
business capability. Add a new domain within these existing layers; do not
introduce a capability root that duplicates the application's layers.
Directory organization is a repository convention; inward dependencies and
responsibility boundaries are the architectural requirements it must preserve.

Order adapter grouping from the technical boundary toward business ownership:
first direction, then entry point or integration responsibility, then concrete
protocol, technology or provider where needed, and finally the capability.
Inbound adapters are grouped by entry point before capability. Outbound
persistence adapters are grouped by storage technology before capability;
other outbound integrations follow the same principle. Avoid repeating a
technology subtree inside each capability. Add only the grouping levels and
implementations required by the current task, without placeholder directories.
A consumer is inbound and a publisher is outbound, even when both use the same
broker. Grouping adapters under one technology does not grant access to another
capability's repositories, collections or implementation details.

Extend the backend from business responsibilities and agreed scenarios. Domain
entities and policies own invariants and state transitions. Application use
cases own sequencing, cross-entity checks and outcomes, and call explicit ports
for external capabilities. Adapters translate and execute technical operations;
composition binds implementations and validated settings. Keep business logic
in its owning layer when adding domains, entry points or integrations, and
preserve capability ownership across the shared layer directories.

Framework composition belongs in the composition layer; the source entry point
bootstraps it. Keep deployment and local environment definitions outside
application source composition. Do not add a separate presentation layer
alongside or inside inbound adapters.

Neither `domain`, `app` nor `ports` imports NestJS, Mongoose/MongoDB driver types,
generated transport DTOs, HTTP/GraphQL decorators or broker SDKs. Convert external payloads
at adapter boundaries. Unit-of-Work contracts expose domain/application concepts,
never Mongoose models/documents, `ObjectId`, query builders or `ClientSession`.
Keep business
decisions out of controllers and other adapters.

Prevent abstraction leaks in `app` and `ports` through semantics as well as
imports. Names, contracts, parameters, results and errors describe business
capabilities, not concrete ODMs, databases, transports or brokers. Do not expose
provider-specific fields or wrap SDK APIs in superficially neutral interfaces.
Technology-specific translation and implementation details stay in adapters
and `infra`.

Start from domain responsibilities, business rules, invariants and scenarios.
Before implementing a domain/application operation, agree its input and output
interfaces with the owner, including results and failure semantics. Then
implement the method defined by those contracts. Do not derive contracts from
a ready-made implementation or a technology API. Changes to agreed contracts
require agreement before implementation; unchanged contracts already approved
in the current work do not need repeated approval.

Each capability logically owns its domain, application, persistence, migrations
and events across these layers; ownership does not require a capability root
containing its own copies of the layers.
Cross-capability access goes through explicit ports and contracts, not another
capability's repositories or collections. Never import another application's `src`
or access its database directly. Shared cross-service business contracts are
versioned external contracts, not domain entities or repository implementations.
Technical helpers need a real second consumer or meaningful duplication; do not
introduce speculative abstractions.

The public API is REST/JSON only. Backend capabilities interact through explicit
application ports. Introduce additional transports only for concrete requirements;
transport variants must preserve equivalent ports and business semantics.

Keep pagination/batch counts, encoded message sizes and protocol-specific
structural limits separate. Each exchange method and direction owns its limits;
record their units and approved values in `docs/arch/transport-limits.md` when
introduced. Do not silently truncate business results or change pagination
when switching internal transports.

Public API modules follow public capabilities rather than mirror downstream
services. Their use cases compose small ports; business decisions and workflow
recovery remain with the capability owning the business outcome.

### Application file roles and DI

Before changing application behavior, identify the use case, initiating actor
or adapter, agreed input/output contracts and affected scenarios. For shared
capabilities, name the supported use cases and the separate responsibility.
A service is not the default destination for workflows.

- The application-layer directory is always `app`, never `application`.
- Use cases belong in `app/use-cases/`, optionally by feature, using
  `<action>.use-case.ts` and `<Action>UseCase`. They own sequencing, preconditions
  and outcomes; avoid forwarding-only wrappers around old services.
- Reusable capabilities belong in `app/services/` with `<name>.service.ts` and
  `<Name>Service`; justify their shared responsibility.
- Ports belong in `ports/inbound/` and `ports/outbound/`, beside `app` and `domain`.
  NestJS controllers use `.controller.ts` and `Controller` names under
  `adapters/inbound/rest/` or `adapters/inbound/grpc/`; they never belong to
  `domain` or `app`. NestJS modules stay in `infra`.
- Support files name their role, such as `.dto.ts`, `.error.ts`, `.policy.ts`,
  `.factory.ts` or `.tokens.ts`. Do not label data/contracts as services.
- Shared DI symbols belong to capability-owned `.tokens.ts` files in `infra`.
  Controllers do not export shared tokens. Keep class tokens where appropriate;
  `domain`, `app` and `ports` must not import composition token modules.

Resolve validated configuration once at bootstrap into immutable per-process
settings. DI binds concrete persistence, concurrency and transport adapters then.
Do not parse config or branch on ODM/transport/strategy in request use cases.
Reject unsupported combinations, invalid pools/routes and excessive aggregate
connection budgets before binding listeners. Never silently degrade a variant.
Site-specific content and configuration remain explicitly scoped data, not
per-request environment parsing or global mutable process settings.

### Multiple sites, publication and access

Resolve a site's trusted identity from validated domain mappings and authorized
administrative context. Normalize and uniquely register domains; reject unknown
domains. Do not trust arbitrary host headers, forwarded headers or caller-supplied
site IDs. Trust proxy metadata only from configured proxies.

Scope site-owned data, queries, uniqueness, authorization, caches, assets,
publication outputs and background jobs by `siteId`. Explicitly model shared
resources and site-specific overrides; sharing does not imply permission to read
or modify another site's data. Global accounts and platform resources require
explicit ownership and authorization rules.

Keep drafts and previews separate from published content. Publishing exposes
only the intended site's approved content and configuration. Define atomic
publication/version switching, cache invalidation and failure recovery for each
publication workflow. Never place secrets, private content or protected access
data in publicly served static files. Dynamic endpoints enforce authentication
and authorization independently of frontend visibility.

Purchased access is a server-side entitlement with explicit user, scope,
validity and lifecycle. Do not grant access from a client redirect or unchecked
payment payload. Verify payment callbacks and process retries idempotently;
define purchase, refund, expiry and revocation behavior in domain contracts.

## 3. MongoDB / Mongoose Schema And Naming Rules

- Collection names are explicit, plural and `snake_case` (`sites`, `bloggers`,
  `site_domains`). Document fields and TypeScript properties use `camelCase`.
- MongoDB documents use `_id`. Domain and API identifiers describe their entity
  (`siteId`, `bloggerId`, `purchaseId`) and use stable opaque strings. Map `_id`
  and any BSON identifiers at persistence boundaries; do not leak Mongoose
  documents or BSON types into domain/application contracts.
- Every site-owned business document has a required trusted `siteId`. Scope
  relevant queries, uniqueness and authorization by site; validate referenced
  entity ownership. Explicitly global collections follow their documented scope.
  Never trust unchecked caller-supplied site or user identities.
- Money uses integer minor units and TypeScript `bigint` in business logic.
  Choose and document an exact BSON representation and lossless transport
  encoding; persistence adapters enforce range and round-trip correctness.
  Currency is explicit. Never convert money or 64-bit IDs through JavaScript
  `number`. Rates and other exact decimal business values use exact arithmetic
  and an exact persistence representation with documented deterministic rounding.
- Timestamps use BSON dates representing UTC instants. Define lifecycle timestamps, version fields,
  audit immutability and retention according to the owning entity.

Define explicit Mongoose schemas in persistence adapters. Validate inputs at
inbound boundaries and enforce domain invariants independently of Mongoose.
Construct allowed filters and updates explicitly; never pass unchecked request
objects or MongoDB operators directly into queries.

Choose embedding versus references from aggregate ownership, bounded document
growth and atomicity requirements. References are scalar identifiers; Mongoose
`ref`/`populate` does not enforce integrity or replace ownership checks. Validate
related entities and site ownership in application workflows. Lifecycle,
anonymization and related deletions are explicit; no implicit cascading deletes.

Use versioned, checksum-verified migrations for data transformations, collection
validators and indexes. Disable automatic production index creation and schema
mutation; apply changes through explicit migrations. Verify required indexes,
uniqueness, validators and resulting document shapes after each migration batch.
Enforce uniqueness with database indexes, not only pre-insert application checks.

Prefer atomic single-document operations within aggregates. When invariants
require atomic writes across documents, use transactions through an application
port with sessions confined to adapters. Docker MongoDB environments used for
these workflows must support transactions, including local development and
integration tests. Define concurrency/version checks, idempotency and
orphan/pending-state reconciliation for affected workflows.

Add required business indexes first, including site-scoped compound uniqueness
where appropriate. Profile secondary indexes with query execution statistics in
diagnostic runs. Avoid indexing every field combination. Use stable keyset
pagination with a unique tie-breaker for large lists, such as `(createdAt, _id)`
inside persistence adapters. Document read consistency and pagination for
financial reads.

## 4. Coding Rules

Use strict TypeScript and precise types, narrowing and explicit contracts. Use
an `I` prefix for new internal object-shape interfaces unless an established
public contract uses another name. Closed string sets use enums. Keep
constants/enums in the narrowest module owning their semantics.

Use structured parsers/APIs instead of ad hoc string manipulation when practical.
Method names describe their action. CRUD-style services default to batch
operations. Add abstractions only for real complexity, meaningful duplication or
durable boundaries. Avoid unrelated cosmetic refactors, preserve owner comments,
and add comments only for essential context. Default to ASCII unless non-ASCII
is required. Never use destructive Git commands without an explicit request.

Use the root `eslint.config.mjs` for linting and TypeScript formatting in every
application and shared package. Do not invent additional rules, duplicate the
config per application or introduce another TypeScript formatter.

The same root configuration governs JavaScript (`.js`, `.mjs`, `.cjs`) and
TypeScript (`.ts`, `.mts`, `.cts`). Before completing source changes, run
`npm run format`, resolve remaining diagnostics, and run `npm run lint` once the project
tooling is bootstrapped. Auto-fix alone is not verification: some layout
violations require manual expansion. Preserve the owner's existing rule options
when extending the configuration. During initial setup, wire these commands to
the copied root configuration and include its parser/plugin dependencies.

## 5. Configuration And Secrets

When variables change, update the affected local `.env` and tracked
`.env.example` without publishing credentials. Keep environment/responsibility
credentials separate. Use `password` for password placeholders and `secret` for
keys/tokens/secrets. Example URLs use localhost unless another endpoint is
required. Service endpoints and selected providers/adapters are explicit;
configuration validation fails instead of silently falling back. Local `.env`
files, private evidence and credentials must not enter Git or published artifacts.

## 6. Verification And Definition Of Done

Each change has concrete observable acceptance criteria. Batch appropriate
checks across coherent changes; correctness-sensitive changes may require
immediate verification. Every bug fix includes a regression reproducing the
original failure at an observable boundary. Never claim unexecuted Red/Green,
test, migration, measurement or deployment results.

Use fake ports and deterministic synthetic fixtures. Tests do not silently call
live external or paid services. Persistence/fault tests use isolated configured
environments; never reset production or unrelated data. All supported adapter
variants pass the same functional, concurrency, fault and reconciliation suites.
Unsupported combinations fail explicitly. Architecture tests enforce the layer
import graph above and reject cross-application source access.

Verify success/failure scenarios and domain invariants defined by agreed
contracts. Cover cross-site isolation, publication visibility, authorization and
entitlement/payment lifecycle behavior whenever affected by a change. Keep
feature-specific acceptance requirements and failure matrices with relevant
tests, contracts or technical documentation, without requiring plan files.

A behavioral Definition of Done includes implemented port-level behavior,
success/failure regressions, relevant typecheck/tests/lint/build, updated
contracts/ADRs/audits, MongoDB schema/index/migration checks when applicable, and verified domain
invariants. Report factually what changed, commands actually run, outcomes and
unresolved limitations in the completion response. Do not create status-tracking
documents merely to record completion. Performance measurements are separate
tasks and must preserve business and financial guarantees; ordinary features
do not require a measurement matrix or video artifact.

This repository has no inherited deployment authorization or procedure from
another project. Follow a project-specific authorized deployment procedure when
one is established; local build success is not deployment success.
