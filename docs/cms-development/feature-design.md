# Feature design and implementation standard

Use this standard during the [feature lifecycle](feature-lifecycle.md). Product
scope and working-tool restrictions remain in the root [AGENTS.md](../../AGENTS.md).
Read scoped instructions and the owning capability contracts for exact behavior.
Apply the following questions to affected boundaries; do not create speculative
services, abstractions or documents for boundaries the change does not touch.

## Behavior and data

Define the initiating actor, source of authority, inputs/results/errors, state
transitions and acceptance examples. Identify which capability owns each invariant
and write. Specify draft/public visibility and the effect on existing readers.
Do not derive a business contract from convenient implementation details, narrow
an agreed port silently or provide Not implemented/empty success from a real provider.

Store instants in UTC. Display and business calendars use the configured IANA
zone, never the owner's city or server-local zone. Date-only values remain dates.
For persistent changes, define identity, lifecycle, reference ownership, versions,
uniqueness, retention and migration needs with the persistence instructions.

For mutations, state the atomicity boundary, concurrent/stale-write behavior,
idempotency rules and recovery from partial or uncertain outcomes. A timeout does
not prove that no effect occurred; use the owning idempotency/reconciliation
contract. Distinguish saved desired state from actually applied runtime state.
Specify cache invalidation, background work and publication effects where relevant.
For expensive work, identify units, admission/queue bounds and cancellation.
Controls and adversarial checks are owned by [security verification](security-verification.md).

## Error outcomes and recovery

An error needs an explicit outcome at its owning operation boundary. Catching it,
logging it or returning a default is not enough. Before implementing an affected
failure path, answer and record in the feature's behavior/design and cases:

- Where will the user see this failure? For background/CLI work, which operator or
  status/result channel owns it? What safe information identifies the failed step?
- What can the user do next? Can they correct input, reload/reconcile state,
  choose another resource, cancel or safely retry? Does the proposed behavior leave
  them in a dead end, lose their input or falsely report success?
- Does the proposed user/operator action actually exist and affect the cause?
  A notification or instruction to contact an operator is not a recovery path
  when neither person has a safe lever to resolve it. Internal resource ownership
  stays with the code; diagnostics may accompany handling but never replace it.
- Should this be an explicit business outcome with defined alternatives, rather
  than an undifferentiated technical error? Examples include a version conflict,
  unavailable reference or uncertain mutation outcome, under the owning contract.
- How have comparable cases been handled in this CMS? Consult the relevant
  maintained contracts, existing interactions and [defect records](../defects/README.md),
  and reuse a sound established pattern instead of inventing a parallel one.

If an answer remains non-obvious after that investigation, ask the owner before
choosing the error behavior, business policy or recovery flow. Record the question
in `60-decisions.md` and continue independent work. Do not guess a convenient
default. Already agreed behavior does not need repeated approval; record a clear
existing precedent and its applicability.

Distinguish expected business rejection, cancellation and unexpected technical
failure. Translate expected outcomes into typed results/errors at the owning
boundary and actionable feedback/status at the consumer. Preserve safe diagnostic
cause/context for the responsible operator without exposing secrets, stack traces
or private resource existence to an unauthorized caller. A log alone is not an
error outcome if the caller or job status still appears successful.

Keep drafts/input and truthful saved/applied state where the contract requires it.
Offer a retry only when its idempotency/reconciliation rules make it safe; a lost
acknowledgement is not proof of failure. An abandoned request or expected no-op
may have no user notification, but its classification, result and cleanup must
be deliberate. Catch only the expected case; propagate other failures. Do not turn
unexpected errors into empty arrays, null, success or a fake production fallback.

For example, after a MongoDB page transaction commits, proposing to tell the
operator that a JS ClientSession object is "stuck" leaves them with no actionable
control over that object. Do not propose operator notification as the resolution
for that internal lifecycle problem. Establish what the pinned driver actually
does, own the session's completion/cleanup in code on every supported exit and use
bounded automatic recovery only where that lifecycle contract permits it. Preserve
a confirmed commit and never replay the page mutation merely to clean up a client
resource. Do not invent a user-facing failure flow or a resource leak from an
arbitrary rejected mock of a driver method. Unexpected technical faults still need
truthful propagation/diagnostics; these do not absolve the code of resource handling.

Reject known dead-end handling proposals before asking the owner to choose one.
Ask about genuinely unresolved business/recovery policy after technical research,
not whether to transfer an internal housekeeping problem to a person unable to act.

Use [testing policy](testing-policy.md) to prove the selected outcome, forbidden
effects and recovery path. A confirmed defect also follows the
[recording procedure](../defects/record-format.md), not just a code correction.

## Backend structure and dependencies

Use npm, Docker, strict TypeScript, NestJS and MongoDB/Mongoose. Keep `domain`,
`app`, `ports`, `adapters` and `infra` as siblings under `src/`, grouping by owning
capability inside each layer. Dependencies point inward. Adapters group first by
direction, then entry point/integration, technology/provider and capability. Do
not repeat a technology tree per capability or introduce a presentation layer.

- `domain` owns invariants and transitions; it imports no ports or frameworks.
- `ports` describe business operations and required capabilities, importing domain
  only, never app/adapters/infra. Names, results and errors are neutral; renaming
  an ODM/SDK wrapper does not make it a business contract.
- `app` orchestrates through ports/domain. No NestJS, database/transport types,
  generated DTOs, configuration parsing or provider strategy branches belong here.
- Inbound adapters translate protocols and call inbound interfaces, not concrete
  use cases. Outbound adapters implement complete approved contracts.
- `infra` composes implementations through factories and validated immutable
  per-process settings before listeners start. Capability-owned `.tokens.ts` are
  leaf constants; adapters may import these, never composition modules/use cases.

Unit-of-Work ports expose business concepts, not ObjectId, Mongoose documents,
ClientSession or query builders. Cross-capability access uses explicit ports,
never another capability's collections or repository implementations. No
sibling-source imports, runtime symlinks, unused services or microservices without
a concrete requirement.

Name workflows `app/use-cases/<capability>/<action>.use-case.ts` / `<Action>UseCase`.
Shared `app/services/` need a concrete reusable responsibility; avoid speculative
abstractions and forwarding wrappers. Support filenames name their role (`.dto`, `.error`, `.policy`,
`.factory`, `.tokens`); modules belong in `infra`.

Public business APIs are REST/JSON; HTML/assets are separate delivery boundaries.
Authenticated read-only CPU telemetry is a narrow socket exception, not authority
to add other business transports. Record each new transport/direction limit with
its unit in [transport limits](../arch/transport-limits.md).

## Asynchronous ownership and cleanup

Observe every Promise from creation, including losing races, parallel siblings,
queue cancellation, timers, cleanup and detached work. Propagate failure through
the operation boundary and release resources on every exit. Apply the error
outcomes above: an empty catch, a catch that only logs and continues, or a global
`unhandledRejection` handler must not hide rejection. Observe cleanup failures too;
do not replace the original failure with apparent success when cleanup also fails.

Define who owns cancellation, subscriptions, listeners, temporary files, streams,
workers and admissions. An operation must settle when its consumer disappears.
Use the failure/cancellation proof requirements in [testing policy](testing-policy.md)
and the file/stream controls in security-verification.md.

## Administration boundary

Keep Svelte/Vite/Bits UI browser components, routing and typed clients in `admin/`.
Use npm workspaces and the root lockfile.
REST adapters, authoritative permissions and business workflows remain in backend
layers. Share deliberate public contracts only, never backend source, domain
entities, repositories or NestJS DTO implementations. Keep Node globals/dependencies
out of browser code and admin source out of server compilation.

Build/serve admin independently of site releases; rendering works without it.
Scope SPA fallback to the configured admin prefix, outside site/API routes.
Public template syntax and reflow/repaint extraction do not process Svelte.
Use [admin instructions](../../admin/AGENTS.md), their interaction conventions and
the [admin contract](../arch/admin-frontend.md) for controls, layout and states.

## Source and configuration conventions

Use the root `eslint.config.mjs` across JS/TS and all workspaces; no second
formatter. Preserve existing ESLint rule options. New internal object-shape
interfaces use `I`; closed string sets use enums. Multiline objects have one
property per line with trailing commas. Multiline `if` conditions start on a new
line, have top-level operators at line starts and the closing `)` on its own line.

Prefer structured parsers/APIs. Preserve owner comments, avoid unrelated
refactors and default to ASCII unless content requires otherwise.
Configuration is explicit and validated, without fake production fallbacks. When
variables change, update affected local `.env` and tracked `.env.example`.
Examples use `password`, `secret` and localhost as appropriate; keep secrets,
local settings and private evidence out of tracked docs, logs and artifacts.

Pin direct dependencies/devDependencies, Node/npm and Docker images exactly.
Commit the workspace lockfile; use `npm ci` in CI/Docker. Upgrade deliberately with
compatibility verification. No floating tags or dependency ranges. Read
[tooling instructions](../../scripts/AGENTS.md) for package/release/image changes.
