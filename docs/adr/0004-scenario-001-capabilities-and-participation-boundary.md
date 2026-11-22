# ADR 0004: Scenario 001 capabilities and participation consistency boundary

Date: 2026-10-24

Status: Accepted capability boundaries. The owner authorized domain models and
port interfaces as code on 2026-10-24. Open workflow policies remain unresolved.

Amendment: [ADR 0009](0009-game-pages-and-recurring-sessions.md) supersedes the
separate Game content capability below. Game content is ordinary Page data;
series, sessions and participation remain optional. The transactional ownership
of capacity, requests, holds and decisions remains in force. The original source
contracts require adaptation; this historical decision does not authorize their
retired game-content workflows.

## Context

The first site's scenario requires generic publishing/content facilities and
custom games, scheduled sessions and participant requests. The owner confirmed
variable group size, required name/phone/email, organizer review and holding all
requested places until a decision. The CMS must remain portable to Bloglist.

## Decision

- Generic CMS capabilities are sites, pages, routing, publication and media.
  Rendering/loader orchestration is application behavior with technical outbound
  adapters. Admin UI composition does not own business data.
- Games and participation are optional site business extensions inside the shared
  architectural layers. Core renderer/publication contracts do not name games
  or booking requests; configured loader bindings integrate public business data.
- Keep scheduled sessions, capacity, booking requests, holds and decisions under
  one participation ownership boundary. Separate records are permitted, but
  session/request/receipt commits must be atomic and version checked.
- A group request allocates its whole quantity or fails. Confirmation converts
  held places to confirmed places; decline releases them. Idempotent retries and
  opposite concurrent decisions must not duplicate capacity effects.
- Implement the reviewed domain/port foundation independently of NestJS and
  storage SDKs. The [domain and port specification](../arch/scenario-001-domains-and-ports.md)
  records contracts and open workflow rules. Domain policies calculate detached
  next states; port implementations must later enforce atomicity and uniqueness.

## Consequences

The engine remains usable without the games extension and without clusters.
Booking consistency does not depend on a browser refreshing quickly or on two
uncoordinated saves. The storage adapter must implement atomic commits/recovery
without leaking database transactions into application contracts.

The initial decision established domain models, projections, inbound/outbound
interfaces and invariant/architecture tests. Subsequent
[ADR 0005](0005-initial-local-application-boundary.md) defines the initial five
application operations and site/page persistence. HTTP endpoints, rendering,
S3 adapters and admin components remain subsequent work.
The admin sections proposal and unresolved business policies retain their review
status. Minimal npm/TypeScript/lint/test tooling verifies the framework-free code.
