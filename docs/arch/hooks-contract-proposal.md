# Hooks: database, domains, ports and contracts

Date: 2026-10-29

Status: Design proposal, not an implementation or an accepted ADR. The owner
has selected the policies listed below. Entity and interface details in this
document are proposed for review. Existing ports, schemas and behavior are not
changed by this document.

Related boundaries: [add-ons](site-addons-contracts.md),
[Snippets](snippets.md), [site dumps](site-dumps.md),
[ADR 0029](../adr/0029-immediate-url-changes-and-address-removal.md),
[ADR 0036](../adr/0036-site-addons.md),
[ADR 0037](../adr/0037-clean-cms-and-site-installations.md),
[ADR 0041](../adr/0041-site-dumps.md) and
[ADR 0042](../adr/0042-portable-category-dumps-and-runtime-addons.md).

## Selected policies

- Checks execute before a change; events describe confirmed changes.
- User-authored code is a separate Hook Handler, not a rendering Snippet.
- Setup completion exists independently for the installation and each site.
- Reactions have durable background delivery, execution history and safe retries.
- User handlers use explicitly permitted queries and commands, not persistence,
  arbitrary services, filesystem, environment or network access.
- Source editing saves a draft. Apply activates an immutable version independently
  of page publication and page rollback.
- Disable stops accepting new reactions. Previously accepted work is suspended;
  enable automatically resumes that work if its original implementation is
  available and its permissions remain valid.
- A logical handler receives events in order for the same ordering subject, even
  through different subscriptions or code versions. A failed event blocks later
  events in that lane, not unrelated subjects or handlers.
- User handlers are site-owned in version 1. Installation hooks have code-owned
  add-on subscribers only.

## 1. Database entities

### 1.1 Conventions and ownership

All identifiers exposed by contracts are opaque strings. MongoDB stores the
entity identifier as `_id`; mappings are confined to persistence adapters.
Business properties use camelCase and collections use plural snake_case.
Instants are BSON UTC dates and transport uses RFC 3339 UTC strings. No document
contains a local calendar/time-zone interpretation of an execution instant.

Business optimistic versions are opaque strings, not ordering counters. Exact
ordering counters use BSON Int64, business `bigint` and unsigned decimal strings
in JSON. They are never converted through JavaScript `number`. Exhaustion
rejects allocation explicitly; counters never wrap. Attempt counts are bounded
safe integers and may use ordinary numbers.

Site-authored configuration documents require top-level trusted `siteId`.
Operational documents belong to an installation and have a discriminated scope:

- Site: `scopeKind = Site`, required `installationId` and `siteId`.
- Installation: `scopeKind = Installation`, required `installationId`, forbidden
  `siteId`. This is a genuinely global scope, not a null or fabricated site.

Validators enforce both branches, including the required siteId on every Site
document. A persisted normalized `scopeKey`, derived by the adapter, supports
unique/indexed scoped lookup. It is not an authorization input or a substitute
for explicit scope fields. Source code cannot choose a different producer scope.

Core and add-on hook/command definitions remain versioned code metadata. They
are not editable database rows, nor is executable add-on code stored in the
handler collections. The clean CMS has no business registrations or seed data.

### 1.2 Collection overview

| Collection | Responsibility | Site dump |
| --- | --- | --- |
| `cms_installations` | Local installation identity and setup completion | Exclude |
| `hook_handlers` | Site-owned identity, editable draft and active version pointer | Include |
| `hook_handler_versions` | Immutable applied source and capability contract | Include |
| `hook_subscriptions` | Site-owned binding of a hook to a custom/add-on handler | Include |
| `hook_scope_states` | Runtime generation, registry fence and event/dispatch cursors | Exclude |
| `hook_events` | Immutable confirmed facts, recipient snapshots and durable dispatch state | Exclude |
| `hook_event_details` | Immutable bounded items of a large change | Exclude |
| `hook_execution_chains` | Durable causal-work reservation and loop budget | Exclude |
| `hook_delivery_lanes` | Logical-handler/subject ordering and ownership fence | Exclude |
| `hook_deliveries` | One subscriber's durable reaction to one event | Exclude |
| `hook_executions` | Attempts of event handlers and synchronous checks | Exclude |
| `hook_command_executions` | Durable command intents and outcome reconciliation | Exclude |

This is twelve collections, not twelve business domains. Embedded drafts and
bounded recipient snapshots avoid extra revision/outbox/recipient collections.
Execution attempts and commands are separate because their growth is unbounded
over time and their retention/failure behavior differs from source definitions.

### 1.3 Installation identity and site setup

`cms_installations` fields:

- `installationId`, mapped to `_id`; unique `singletonKey = Local`.
- `setupState`: `Pending | Completed`.
- `setupContractVersion`, `version`, `createdAt`, `updatedAt`.
- Nullable `setupCompletedAt`, `setupCompletedBy`.

The identity is created once through explicit installation initialization and
survives restarts and site restores. It is not regenerated at every bootstrap.
Setup completion is an optimistic, idempotent transition from Pending to
Completed. Completion and its event are recorded together. Repeating a successful
completion produces no second event. Imported site data cannot complete or reset
installation setup.

Extend the existing `sites` aggregate with `setupState`, `setupContractVersion`,
opaque `setupVersion`, nullable `setupCompletedAt` and nullable
`setupCompletedBy`; do not create a second site entity. Site
creation and completion of its setup are separate facts. Completion does not
require a published page or an enabled business add-on. Actual readiness is
checked by the owning setup operation, not by arbitrary after-event handlers.

Existing installations/sites need an explicit adoption policy before migration:
do not infer historical setup events from bootstrap, existing pages or a dump.
The proposed policy is to adopt already operating installations/sites as
Completed without emitting historical events; fresh ones start Pending.

### 1.4 HookHandler: `hook_handlers`

Aggregate root for a user-authored site handler:

- `hookHandlerId`, `siteId`, `name`, `kind: Check | Event`.
- `draft`: source TypeScript, declared accepted hook/version pairs, typed
  configuration schema, requested query/command capability references and
  resource profile. A Check cannot request command capabilities.
- Nullable `activeVersionId`; `enabled`; opaque `version`.
- `createdAt`, `updatedAt`, `createdBy`, `updatedBy`.

One handler has one kind, but may explicitly support multiple compatible hooks.
Each actual subscription still selects exactly one hook/version pair. Matching
is never inferred from a handler's name. Names are display labels, not identity;
duplicate names need not become a new uniqueness restriction.

Saving changes only the draft. Apply validates and compiles the captured draft,
then atomically inserts an immutable version, switches activeVersionId and
updates the registry fence. Apply checks expected handler and registry versions.
It does not implicitly enable a disabled handler. A missing active version
prevents enable and subscription activation.

Index: `(siteId, createdAt, _id)` for stable keyset listing. `_id` is unique.
All mutations match siteId and expected version. Hard deletion is outside v1;
disable is sufficient and does not break historical references.

### 1.5 HookHandlerVersion: `hook_handler_versions`

- `hookHandlerVersionId`, `siteId`, `hookHandlerId`.
- Immutable source TypeScript and compiled JavaScript.
- Compiler/runtime contract versions and artifact digest.
- Accepted hook/schema pairs, configuration schema, permitted query/command
  declarations, kind and resource profile.
- `appliedAt`, `appliedBy`, `sourceDraftVersion`.

Definitions and compiled artifacts are private. They never enter public release
files or public media. Versions referenced by an active handler, subscription,
nonterminal delivery, command or retained execution cannot be removed. Unreferenced
version cleanup is an explicit retention operation, not Apply's side effect.

Indexes: `(siteId, hookHandlerId, appliedAt, _id)` and unique
`(siteId, hookHandlerId, sourceDraftVersion)` for idempotent Apply. A digest is
integrity metadata, not a reason to merge two distinct handler identities.

### 1.6 HookSubscription: `hook_subscriptions`

- `hookSubscriptionId`, `siteId`, `hookKey`, exact `hookSchemaVersion`, `kind`.
- `ownerKind: User | Addon`; nullable owning `addonKey` for add-on-owned bindings.
- `handlerRef`: either custom hookHandlerId or `(addonKey, handlerKey)`.
- Typed `configuration`, bounded declarative equality filters on hook-declared
  fields, `enabled`, opaque `version`.
- Check bindings: deterministic priority; all active checks are required.
- Event bindings: approved retry profile and explicit `deliveryMode: Event |
  Detail`. Detail requires the hook's registered detail schema and a compatible
  handler declaration. Ordering is inherited from the hook's subject contract
  and cannot be silently disabled per binding.
- Availability requires an enabled binding/handler and, for add-on consumers,
  an enabled site connection. An installation binding follows installed-package
  availability independently of site connections.
- `createdAt`, `updatedAt`, `createdBy`, `updatedBy`.

User bindings can target only site-owned user handlers. Add-on bindings are
materialized/reconciled from trusted manifests and connection configuration;
ordinary source editing cannot replace them with user code or grant additional
access. Disabling a binding suspends existing deliveries exactly like disabling
the handler. Re-enabling resumes them; no events from the disabled interval are
backfilled.

Several subscriptions of one handler to the same hook are allowed with different
configuration. They deliberately produce separate deliveries. No arbitrary
predicate code runs inside database matching. There are no wildcard subscriptions
or subscriber dependency graphs in v1.

Indexes: `(siteId, hookKey, hookSchemaVersion, enabled, _id)`,
`(siteId, handlerRef.kind, handlerRef.id)` with the concrete discriminated fields,
and unique partial `(siteId, addonKey, manifestSubscriptionKey)` for code-owned
bindings. Installation subscriptions come from code-owned package metadata and
do not create site-owned rows.

### 1.7 HookScopeState: `hook_scope_states`

- Scope identity and normalized scopeKey.
- `generation`: an opaque runtime epoch, changed after successful site restore.
- `registryVersion`: optimistic fence for effective subscriptions/availability.
- Exact `lastEventSequence`, `lastDispatchedSequence`.
- `mode: Active | Maintenance | RecoveryRequired`.
- Dispatch ownership token/deadline and concurrency guard.

Unique index: `(installationId, scopeKey)`. This is runtime coordination, not
site content or a second copy of site settings. Registry-changing commits and
source commits serialize against the captured registryVersion. A stale audience
snapshot must be recomputed before committing; a source mutation is not replayed
after an unknown commit result.

The installation-level epoch coordinates global events. Site epochs coordinate
site events. Per-scope sequence allocation is intentionally simple for the CMS's
current scale; it does not imply one sequence for every site in the installation.

### 1.8 HookEvent: `hook_events`

Immutable fact/envelope:

- `hookEventId`, explicit scope, `generation`, exact `sequence`.
- `hookKey`, exact `hookSchemaVersion`, trusted `producerRef`.
- `operationId`, `factKey`, `correlationId`, nullable `causationId`, causal depth.
- `occurredAt`, initiating actor reference (audit identity, never an authority
  grant).
- `subject`: owner capability, entity kind and opaque identity; optional prior
  and resulting business versions.
- Bounded immutable payload and `detailCount` for separately stored change items.
- Bounded immutable recipient snapshot: subscription identity/version,
  configuration, original handler version or add-on artifact digest, granted
  capability references, retry profile and ordering subject.

Mutable infrastructure fields are separate from that immutable envelope:
`dispatchState: Pending | Complete`, recipient cursor and dispatch timestamps.
An event with no recipients is still a confirmed fact and is immediately
dispatch-complete. Creation of a later subscriber does not add it to old events.

Indexes:

- Unique `(installationId, scopeKey, generation, sequence)`.
- Unique `(installationId, scopeKey, generation, operationId, factKey)` for
  recording the same logical fact after acknowledgement recovery.
- `(installationId, scopeKey, generation, dispatchState, sequence)`.
- `(installationId, scopeKey, hookKey, occurredAt, _id)` for filtered keyset history.

Payload does not contain whole drafts, private add-on settings or credentials by
default. Deleted-entity events retain the necessary bounded prior values, so a
handler need not read a row which no longer exists.

### 1.9 HookEventDetail: `hook_event_details`

- `hookEventDetailId`, explicit scope, generation, eventId and exact ordinal.
- Typed immutable change item and digest.

Unique index `(installationId, scopeKey, generation, eventId, ordinal)`.
This collection has a concrete purpose: whole-site publication, subtree moves and
imports can affect more entities than fit in a bounded event payload. Their
summaries contain counts and identifiers of the change, while every actual delta
remains available through immutable keyset-paged details. No silently truncated
affected-ID arrays and no later reconstruction from mutable working data.

Details and the source event are committed together for database-only changes;
file-backed changes use the recovery protocol below. A summary-only subscriber
need not read all details. A subscriber requiring per-item work uses bounded
delivery units declared by its manifest, each referring to an exact detail
ordinal; it does not need one unbounded worker execution. This fan-out choice is
part of its subscription contract, not an automatic change of business results.

### 1.10 HookExecutionChain: `hook_execution_chains`

This coordination record contains chainId, trusted originating scope/generation,
root operationId, maximum depth, exact reservedCommandCount, version and
createdAt/updatedAt. Unique identity is scope/generation/root operation. Each
accepted command plan atomically reserves its count against this record once;
a retry of the same plan reserves nothing twice. This record prevents concurrent
branches from each independently spending the entire causal budget. It contains
no unbounded array of child events. It is retained while any descendant
event/delivery/command still depends on it.

### 1.11 HookDeliveryLane: `hook_delivery_lanes`

- `hookDeliveryLaneId`, explicit scope and generation.
- Stable logical consumer identity and ordering subject. A user consumer is its
  handlerId; an add-on consumer is its addonKey/handlerKey pair.
- Exact `lastAssignedSequence`, `lastSettledSequence`, concurrency fence.

Unique index on scope/generation/consumer/ordering subject. Source
versions and different subscriptions of the same handler do not create new
streams: applying new code or using another binding must not overtake old
events. Default ordering subject is the event's aggregate identity. Routing graph
and release events use their owning site-routing/site-publication aggregate.
Per-item deliveries retain the source aggregate's lane, ordered by event sequence
then stable subscription identity and detail ordinal. There is no global ordering
across unrelated subjects. Disabling just one binding may therefore block later
work of another binding of that same handler/entity until resume or explicit skip.

An explicit terminal skip settles a lane item but remains visible in history.
Exhausted retries do not silently settle it. Restoring the site starts new lanes
under a new scope generation.

### 1.12 HookDelivery: `hook_deliveries`

- `hookDeliveryId`, explicit scope, generation, eventId.
- Subscriber identity and original recipient snapshot reference; optional
  detail ordinal; laneId and exact laneSequence.
- State: `Pending | Running | RetryScheduled | Paused | Succeeded | Failed |
  OutcomeUnknown | Skipped | Superseded`.
- Pause reason/resume state, `attemptCount`, `nextAttemptAt`.
- Execution owner token, deadline, opaque claim fence, nullable activeExecutionId.
- `createdAt`, `updatedAt`, nullable completedAt and sanitized last error.

Unique `(installationId, scopeKey, generation, eventId, subscriberId, unitKey)`
and unique `(laneId, laneSequence)`. Indexes for `(state, nextAttemptAt, _id)` and
scoped `(subscriberId, state, createdAt, _id)`; concrete compound scope prefixes
apply to every administrative query. Claim and completion compare the ownership
token/fence and current epoch. An expired worker cannot acknowledge a new claim.

Claiming only the next unsettled item in a lane prevents overtaking. Multiple
workers may serve unrelated lanes. Losing a worker causes recovery, not an
assumption that its effects did not happen.

### 1.13 HookExecution: `hook_executions`

- `hookExecutionId`, explicit scope and generation.
- `kind: Check | Event`, operationId and subscription identity.
- Optional deliveryId for reactions; exact attempt number.
- Exact source implementation/version/digest and configuration digest.
- `startedAt`, nullable `finishedAt`, duration and execution-owner fence.
- Outcome: `Running | Allowed | Denied | Succeeded | Failed | Interrupted |
  OutcomeUnknown`.
- Structured sanitized diagnostic, denial reason, bounded output summary.

Each new attempt creates a new row. Started rows are mutable only until their
terminal transition; completed history is immutable. A unique partial
`(deliveryId, attemptNumber)` applies to event attempts. Indexes support scoped
time/id keyset history and operationId lookup. Logs do not contain credentials,
raw exception objects or unrestricted console output.

The execution journal is not the source of truth for whether a page mutation
committed. Check denial/error attempts may be journaled independently of the
source write; logging failure before a mandatory check prevents proceeding.
Crash recovery marks abandoned checks Interrupted and never infers an Allow.

### 1.14 HookCommandExecution: `hook_command_executions`

- `hookCommandExecutionId`, explicit scope and generation, deliveryId.
- `commandKey` assigned within the persisted handler result, command name/version.
- Immutable validated arguments, their digest and a stable idempotency key.
- `state: Prepared | Running | Succeeded | Failed | OutcomeUnknown`.
- Attempt/execution references, target operationId, timestamps and bounded
  result/error receipt.

Unique `(deliveryId, commandKey)` and scoped unique idempotency identity. A
different argument digest for the same key is an IdempotencyConflict. Commands
are prepared durably before execution and run in declared order. Successful
commands are never repeated merely because a later command failed.

The handler's accepted command list is persisted once before any command runs.
Recovery uses that list rather than rerunning code to produce a different plan.
There is no all-or-nothing transaction across unrelated commands or external
providers. A command requiring multi-record atomicity must itself be an owning
capability's explicit atomic operation.

The host ledger alone cannot guarantee exactly-once effects. A command is safely
retryable only when its owning application supports the supplied idempotency key
and can return/reconcile the original outcome. Otherwise an interrupted attempt
is OutcomeUnknown and blocks automatic replay. Provider-specific idempotency and
receipts remain in the integration adapter/capability.

### 1.15 Cross-entity invariants, backups and retention

- A subscriber/version/configuration is captured when the source change commits,
  not when a worker eventually starts.
- Current authority may restrict an old grant. Execution uses the intersection
  of the original grant and current policy; old work never gains new privileges.
- Applying code does not migrate outstanding deliveries to that code. Missing old
  artifacts pause delivery until restored; there is no substitution fallback.
- Event persistence is the outbox. There is no second collection duplicating the
  same source facts under another name.
- Only terminal, unreferenced operational records are eligible for cleanup.
  An event/details/version needed by a pending, paused, failed-blocking or unknown
  delivery cannot expire. TTL indexes must not delete those dependencies.
- Retention is reference-aware and explicit. Proposed defaults are 90 days for
  completed execution/command diagnostics and settled event history, with longer
  retention where unfinished work requires it. This is not immutable audit
  retention for every business capability.

Dump classification must become explicit. The current required-siteId heuristic
would otherwise accidentally copy queues. Preserve that ownership validation,
but add trusted core/installed migration metadata classifying included site
configuration and excluded operational collections. No collection-name guess,
optional siteId trick or capability-owned query bypass is acceptable.

Complete site dumps include handlers, required applied versions and subscription
definitions. Operational history/queues, installation identity, leases, grants
issued by the host and scope state are excluded. A future selective user-source
import creates disabled drafts; it does not automatically apply executable code
or become part of the existing Snippets archive category. A complete same-site
restore preserves applied versions and enabled states, verifying source/artifact
integrity, runtime compatibility and current host capabilities before resuming.
An unavailable dependency blocks the affected execution explicitly. Add-on-owned
subscriptions are reconciled from compatible packages and restored connections.

Restoration quiesces background executors as well as HTTP. After database/file
success is reconciled, rotate the site generation, fence old commands/workers,
mark old deliveries Superseded and record one restoration event in the new
generation. Old work is not replayed against restored data. A rollback which
restores the original state retains its original generation and pending work.
An unresolved result keeps the site in RecoveryRequired. The recovery journal
must distinguish both outcomes before opening the maintenance gate.

## 2. Domains and responsibility boundaries

### 2.1 New capability: Hooks

Add a `hooks` capability across the existing layer-first directories:
`src/domain/hooks`, `src/app/use-cases/hooks`, `src/app/services/hooks`,
`src/ports/inbound/hooks`, `src/ports/outbound/hooks`, matching adapter groups and
`src/infra/hooks`. These are intended locations, not directories to scaffold now.
There is no capability root containing another set of architectural layers.

Hooks owns handler/subscription lifecycles, version activation, check outcomes,
event delivery policies, pause/resume, causal bounds, idempotency of its own
management actions and execution history. Its domain types describe these
semantics without NestJS, Mongoose, Worker, HTTP or package-loader objects.

Outbox dispatch, worker ownership, indexes and artifact loading are technical
implementations of the contracts, not new business domains. Do not create separate
EventBus, Queue, Workflow, Automation, Scripting or Plugins domains for v1.

### 2.2 Extend existing owners

- Sites continues to own site creation/settings/setup completion.
- Pages owns content, archival and version restoration.
- Routing owns URL/redirect graph changes and their consistency.
- Publication owns release construction, activation and recovery receipts.
- Addons owns package/connection availability and mandatory enable preparation.
- Dumps owns replacement/recovery and coordinates Hooks through an explicit port.
- Each business add-on owns its own facts, checks, commands and invariants.

An installation identity/setup aggregate is new. Keep it in a narrow
`installation` ownership group; it is not a second site and Hooks does not decide
whether installation setup is complete. Existing bootstrap/composition reads
validated local configuration but does not emit completion on process start.
Building an entire setup wizard is outside this hooks design.

### 2.3 Where decisions belong

Owning use cases authorize actors, capture state, invoke extension checks and
commit their changes with event intents. Owning domains retain their invariants.
Hooks selects eligible bindings and validates execution contracts. Adapters
translate/persist/run code. Composition registers contracts and binds adapters.

A check result based on mutable foreign-capability data is advisory unless the
owning workflow revalidates the relevant conditions at commit. Critical
cross-capability restrictions require an explicit agreed business port and
guarded mutation protocol. There is no arbitrary cross-repository callback or
claim that an asynchronous/read-only check alone proves a database guarantee.

## 3. Ports

Names below are proposed framework-independent interfaces. All inputs/results
are immutable domain values; no database sessions, documents, Worker handles,
HTTP requests or Nest module tokens cross these ports. Mutating administration
requires an authenticated active global administrator authorized for the site,
or an explicitly trusted local operator under the existing local boundary.
Trusted actor/scope context comes from the adapter, not caller JSON.

### 3.1 Inbound management operations

Each operation has its own inbound interface and use case. Rows grouping names
do not imply a forwarding CRUD service.

| Inbound interface | Input | Result / principal failures |
| --- | --- | --- |
| `IListHookDefinitions` | Authorized scope, kind/provider filter, cursor, count | Keyset page of registered hook/schema definitions, including availability; invalid cursor/scope rejects |
| `IListHookCommandDefinitions` | Authorized site and cursor/count | Only commands the host permits that site to grant, not an arbitrary service catalogue |
| `IListHookHandlers` | Authorized site, cursor/count | Handler summaries without code/configuration secrets |
| `IGetHookHandler` | Site, handlerId | Draft, active-version metadata and usages; foreign/missing rejects |
| `ICreateHookHandler` | Site, name, kind and draft | Disabled handler with no active version; schema/budget errors reject |
| `IUpdateHookHandlerDraft` | Site, handlerId, expectedVersion, full draft/name | New draft version, active code unchanged; stale rejects |
| `IApplyHookHandler` | Site, handlerId, expectedVersion, expectedRegistryVersion | Immutable version and updated active pointer; compiler error or incompatible enabled bindings rejects without switching |
| `ISetHookHandlerEnabled` | Site, handlerId, expectedVersion, enabled | Updated handler and registry version; no active code rejects enable; equal checked input is a no-op |
| `IListHookSubscriptions` / `IGetHookSubscription` | Site, filters or binding identity | Paged summaries or full authorized binding |
| `ICreateHookSubscription` / `IConfigureHookSubscription` | Site, exact hook ref, handler ref, configuration/filter, expectedVersion on update | Disabled new binding or checked replacement; ownership/kind/schema/capability mismatch rejects |
| `ISetHookSubscriptionEnabled` | Site, subscriptionId, expectedVersion, enabled | Updated binding/registry and automatic pause/resume eligibility; no compatible implementation rejects enable |
| `ITestHookHandler` | Site, draft identity/version, hook ref and typed synthetic fixture | Allow/deny or proposed command list and diagnostics; no commands execute and no domain event is emitted |
| `IListHookEvents` / `IGetHookEvent` / `IListHookEventDetails` | Authorized scope, filters/identity and keyset cursor/count | Private event envelope, visible recipient summaries and immutable details; no source secrets |
| `IListHookDeliveries` / `IGetHookDelivery` / `IListHookExecutions` | Authorized scope, identities/filters, keyset cursor/count | Private operational history and blocking-lane information |
| `IRetryHookDelivery` | Scope, deliveryId, expectedVersion | Retry the original failed delivery/version/command plan; success, unknown effects or unavailable original implementation cannot be blindly replayed |
| `ISkipHookDelivery` | Scope, deliveryId, expectedVersion, required reason | Terminal recorded skip and lane progress; Running or unresolved command effects reject |
| `IReconcileHookCommand` | Scope, commandExecutionId, expectedVersion | Owning capability's known outcome or still OutcomeUnknown; never fabricates success |

All mutable operational rows exposed for administrative changes carry opaque
versions in addition to worker claim fences. Definitions are code-owned; there
is no administrative CreateHookDefinition or arbitrary EmitEvent endpoint.
No hard-delete handler/subscription or replay-successful-event workflow in v1.

Setup ownership additionally introduces `ICompleteInstallationSetup` and
`ICompleteSiteSetup`. Inputs are trusted scope/actor and expected setup version;
results contain the resulting setup state/completion identity. Invalid readiness
rejects without completing, stale writes conflict, equal completed input returns
the original completion. They do not create accounts, content or business add-ons
implicitly. Setup wizard UI is not included in these contracts.

### 3.2 Internal inbound execution operations

These interfaces are called by the owning application/composition, never exposed
as generic public REST commands:

| Interface | Responsibility |
| --- | --- |
| `IEvaluateHookChecks` | Accept an authorized proposed operation and captured facts; select checks, evaluate them and return a guarded Allow permit or structured Deny |
| `IPrepareHookChange` | Validate typed fact intents and capture effective event subscribers, exact code/configuration and scope/registry guard for the owning mutation |
| `IDispatchHookEvents` | Dispatch a bounded amount of committed event work in scope-sequence order; crash-resumable fan-out creates idempotent deliveries/lane positions |
| `IProcessHookDeliveries` | Claim bounded eligible lane heads, evaluate code, persist command plans, execute/reconcile permitted commands and settle outcomes |
| `IRecoverHookExecutions` | Recover expired execution ownership; use command receipts to distinguish safe retry from unknown outcome |
| `IQuiesceHooks` / `IResumeHooksAfterMaintenance` | Stop claims, fence/drain relevant effects and report quiescence; resume only after the owning maintenance outcome is known |
| `IReconcileHooksAfterSiteRestore` | Rotate/retain generation according to the confirmed restoration outcome, supersede old work only on success and rebuild registry eligibility |
| `ICleanHookHistory` | Reference-aware cleanup under the configured retention policy; never erase blocking or unknown work |

Dispatch/process return bounded progress summaries, not fabricated completion of
all pending work. Work count, encoded size and execution duration have distinct
limits. Worker scheduling belongs to infra; there is no new public job runner.

### 3.3 Outbound ports required by Hooks

| Outbound interface | Semantic operations |
| --- | --- |
| `IHookDefinitionCatalogPort` | Resolve exact hook schemas, producer ownership, scope/subject rules and compatibility; enumerate authorized definitions |
| `IHookCommandCatalogPort` | Resolve exact command input/output schemas, required capabilities, current availability, idempotency and reconciliation policy |
| `IHookHandlerStorePort` | Read/list roots and versions; create/update drafts; atomically apply an immutable version and active pointer under expected versions; checked enable/disable with registry fence |
| `IHookSubscriptionStorePort` | Read/list/create/configure bindings; reconcile code-owned bindings; checked enable/disable with registry fence; return immutable matching snapshots |
| `IHookAccessPort` | Authorize management/test/history/retry/skip actions and issue scoped execution grants from current policy; audit identity is not authorization |
| `IHookValuesPort` | Allocate opaque identities/versions and explicit UTC instants for deterministic use cases; no process-global clock/random reads in domain methods |
| `IHookSourceCompilerPort` | Validate/transpile a captured source under an explicit compiler contract; return private compiled artifact or sanitized source diagnostics |
| `IHookRuntimePort` | Evaluate one Check or Event invocation against exact implementation/configuration, bounded inputs and approved read-query bridge; return typed outcome/command plan; cancellation and resource failures are explicit |
| `IHookQueryPort` | Execute only declared typed queries under the supplied scoped grant and read policy; distinguish event snapshot reads from current business reads |
| `IHookChangePreparationPort` | Capture registry/generation and recipients and issue guarded fact intents for an owning source commit; this port does not persist the source change |
| `IHookEventStorePort` | Read exact event/details and keyset history; atomically advance dispatch cursor while creating idempotent deliveries/lanes; reclaim dispatch ownership |
| `IHookDeliveryStorePort` | Claim eligible lane heads, renew ownership, persist transitions under fences, pause/resume, retry/skip, settle lane progress and query history atomically |
| `IHookExecutionStorePort` | Start/finish check/event attempts; reconcile abandoned attempts; exact-code history lookup with bounded diagnostics |
| `IHookCommandStorePort` | Persist a validated command plan once, start/record/reconcile command outcomes, reject conflicting argument digests and keep successful checkpoints |
| `IHookCommandExecutorPort` | Invoke/reconcile a registered owning-capability operation under a scoped grant, stable command identity and idempotency contract; no service lookup by class name |
| `IHookScopeStorePort` | Read/fence scope generation/registry state, maintenance coordination and restoration reconciliation |
| `IHookHistoryRetentionPort` | Delete only eligible referenced-graph-checked terminal history in bounded batches |

Store methods expose domain atomicity such as ApplyHandlerVersion,
DispatchEventRecipients and SettleDelivery. They do not expose low-level
transactions or generic filters. Where a change spans Hooks-owned collections,
one store operation owns that complete mutation. No use case separately writes
an active pointer, version document and registry counter with partial success.

Runtime resolution is an outbound adapter over the registered custom-version and
add-on artifact sources. It returns explicit Unavailable on a missing digest and
does not load the latest implementation as fallback.

### 3.4 Outbound contracts required by existing source capabilities

Existing use cases need small extension ports rather than concrete Hooks services:

- A check-evaluation port offers `evaluate(proposedOperation)` with the exact
  accepted operation schema and read-only captured facts.
- A change-preparation port offers `prepare(changeFacts, permit)` and returns
  `IHookCommitIntent`: scope/generation/registry guard, logical operation identity,
  validated event/detail intents, recipient snapshots and optional command
  completion receipt. The permit is an application concept, not a database session.
- The existing owning mutation port accepts that commit intent as part of its
  contract, while retaining its existing business result and failure semantics.
  This context is required for registered event-producing write paths, not an
  optional best-effort notification. Migrations and restoration have separate
  explicit technical replacement contracts and do not synthesize ordinary facts.

Examples of affected ports are page creation/archival/publication, site updates,
URL graph changes, release activation and add-on connection commits. They still
describe those capabilities, not a generic save-any-object operation. Accepted
port changes require owner agreement before implementation.

For database-backed operations, the real persistence adapter performs the business
write, captured-guard recheck, event/detail inserts, source sequence allocation
and any safe command receipt in the same transaction. A technical Hooks recorder
may share the adapter's transaction internally through infra composition; its
session types never appear in app/domain/ports or the public SDK. The adapter
does not directly import another capability's repository.

Do not introduce an application `emit()` call after save, a transaction-shaped
application callback exposing repositories, or a standalone append port claiming
that two independent commits are atomic. Add-ons use the same versioned commit
intent/receipt protocol via an integration adapter inside their persistence
boundary. They do not write core hook collections directly.

An idempotent command's result receipt must commit with the command's business
effects through that owning port. A host row written after the effect is not
proof of exactly-once execution. Commands lacking such a contract are classified
as non-retryable/needs-reconciliation until their own boundary is extended.

For file-backed effects, the owning capability's journal records the logical
operation identity and planned events. Only a confirmed/reconciled completed
outcome makes events eligible for dispatch. Abort creates no success event;
unknown outcome holds dispatch. Reconciliation records a missing fact exactly
once under operationId/factKey. No generic transaction promise is made across
MongoDB and the filesystem.

### 3.5 Precise shared value shapes and operation results

These are contract records, not implementation declarations. Fields described
as trusted are never accepted directly from public JSON. Nested value schemas
are versioned, finite JSON with reserved prototype keys rejected. The same
business values are mapped to BSON by adapters and JSON by transport adapters.

| Record | Required meaning/fields |
| --- | --- |
| `IHookScope` | Discriminated Site `{installationId, siteId}` or Installation `{installationId}`; no nullable site placeholder |
| `IHookRef` | `{hookKey, schemaVersion}` resolving to exactly one registered schema/kind |
| `IHookImplementationRef` | Custom `{siteId, handlerId, versionId, artifactDigest}` or Addon `{addonKey, handlerKey, implementationVersion, artifactDigest}` |
| `IHookSubscriberRef` | SiteBinding `{siteId, subscriptionId}` or code-owned InstallationBinding `{addonKey, manifestSubscriptionKey}`; stable identity survives implementation updates |
| `IHookProposedOperation` | operationId, scope, actorRef, subject, captured business version(s), check hook ref, candidate schema/value/digest, root chain/causation context |
| `IHookCheckPermit` | operationId, scope, generation, expectedRegistryVersion, candidate digest, checked business versions, exact successful check implementation refs; bound to this candidate only |
| `IHookCheckDecision` | Allow `{permit}` or Deny `{hookRef, subscriberRef, reasonCode, reasonParameters}`; technical failures are typed failures, never an Allow |
| `IHookFactIntent` | Stable factKey, hook ref, subject, occurredAt, immutable typed payload and ordered typed detail items; producer/actor/causality supplied by trusted context |
| `IHookCommitIntent` | operationId, trusted scope/generation, expectedRegistryVersion, optional bound check permit, fact intents and their frozen recipients; optional command outcome receipt; exact argument/candidate digests |
| `IHookPreparedChange` | The commit intent and its digest; not a receipt that a business mutation has already happened |
| `IHookCommittedReceipt` | operationId, scope/generation, confirmed event identities/sequences and owning business outcome reference; obtainable after an unknown acknowledgement without redoing the change |
| `IHookRecipientSnapshot` | Stable subscriber ref/version, logical consumer ref, implementation ref, frozen configuration/filter result, original capability grant refs, retry profile, ordering subject, Event or Detail unit mode |
| `IHookDeliveryClaim` | delivery/event/unit identities, exact implementation and configuration, scope/generation, lane position, execution identity, owner token/fence, deadline and original grants |
| `IHookCommandPlan` | deliveryId, plan digest, ordered distinct commandKey/schema/argument records; validated and stored once |
| `IHookCommandInvocation` | commandExecutionId, command ref/arguments/digest, trusted scope, generation/fences, stable idempotencyKey, checked current grant, causal context and deadline |
| `IHookCommandOutcome` | Confirmed `{owningReceipt, typedResult}`, Rejected `{code, safeDetails, retryClass}`, or Unknown `{owningOperationId, reconciliationRef}`; Rejected guarantees no unacknowledged effect |
| `IHookMaintenanceBarrier` | Scope, current generation, opaque barrier identity, fencing version and drained status; only a quiescent confirmed barrier permits data replacement |
| `IHookPage<T>` | `{items, nextCursor}` with stable tie-breaker; encoded cursor binds scope/filter/order and rejects reuse under another scope |

Check decisions do not contain a generic authorize token usable by an unrelated
operation. Business mutation results remain their existing Page/Url/Publication
contracts; the owning adapter records the hook commit receipt without replacing
those results with a transport envelope.

Principal method contracts for the execution/store ports:

| Port method | Input -> result | Atomic/failure requirement |
| --- | --- | --- |
| `checks.evaluate` | ProposedOperation -> CheckDecision | Every active check evaluated against the captured registry; Deny/error grants no source-write permission |
| `changes.prepare` | ProposedOperation, optional permit, FactIntent[] -> PreparedChange | Schema/producer/scope mismatch rejects; changed registry invalidates the permit |
| `handlers.apply` | siteId, handlerId, expectedVersion, expectedRegistryVersion, compiled captured draft -> applied version/root | Version insert, pointer and registry fence commit together; wrong draft digest rejects |
| `subscriptions.setEnabled` | scoped identity, expectedVersion, enabled -> updated binding and registry version | Binding and registry fence change atomically; outstanding work retains original snapshots |
| `events.dispatchNext` | scope, expectedGeneration, bounded work request, dispatch owner -> dispatch progress/cursor | Recipient delivery/lane insertion and event cursor update are atomic for each committed batch; duplicates resolve to the same records |
| `deliveries.claim` | authorized worker identity, current UTC instant, scope eligibility, maximum claim count -> claim list | Only lane heads; atomic ownership/fence; zero eligible claims is a real empty result |
| `deliveries.renew` | claim identity/fence, new bounded deadline -> renewed claim | Expired, superseded or foreign ownership rejects |
| `executions.begin` / `finish` | claim/check identity and exact version -> execution; terminal outcome + fence -> execution | One attempt identity; terminal history cannot be overwritten |
| `commands.preparePlan` | live claim, full validated plan -> stored immutable plan | Plan insert, unique command intents and causal-budget reservation are atomic; same digest reuses result; different digest conflicts |
| `commands.execute` | CommandInvocation -> CommandOutcome | Owning capability commits safe receipt with its effects; never claims safety from a host-only after-write |
| `commands.reconcile` | stable scoped command identity/reconciliation ref -> CommandOutcome | Read/reconcile original effects; does not reissue a non-idempotent command |
| `deliveries.finish` | claim/fence, final outcome, command receipt refs -> delivery and lane state | Check all required command outcomes; success/skip and lane progress commit together |
| `scopes.quiesce` | scope, maintenance operationId, current generation -> MaintenanceBarrier | Stop claims and drain/fence effects before reporting drained; timeout rejects replacement |
| `scopes.reconcileRestore` | barrier, confirmed Restore/Rollback/Unknown result identity -> scope state and restoration receipt | Restore rotates once and records one fact; Rollback retains generation; Unknown blocks reopening |

Different store ports participating in one Hooks-owned atomic operation are
implemented behind one owning method above. Use cases do not stitch together
independent method successes and call that a transaction. Catalog lookup and
compilation may happen before the commit, followed by captured-version validation.

The source capability also exposes an outcome lookup under operationId whenever
its mutation is registered as safely retryable. No provider-neutral interface
contains a MongoDB transaction/session or an SDK request handle.

## 4. Remaining contracts

### 4.1 Definition and registration contracts

`IHookDefinition` contains hookKey, owner/provider, kind, schemaVersion, allowed
scope, typed input/payload/detail schemas, subject and ordering rules, declared
filter fields, exposure policy and applicable check failure policy.

`IHookHandlerDefinition` for code-owned add-on handlers contains stable handlerKey,
kind, exact accepted hook/schema pairs, configuration schema, implementation
artifact identity, query/command capabilities, event/detail delivery granularity
and safe retry classification.
The site-connection availability rule cannot be overridden by a handler manifest.

`IHookCommandDefinition` contains stable command name/schemaVersion, typed
arguments/result, owner, required capabilities, availability policy, retry
classification and outcome lookup contract. Definitions describe business
operations, never model names, collection selectors or arbitrary HTTP URLs.

Core owns `cms.*`; add-on A owns `addon.<A>.*`. Producers may emit only their own
declared facts and only in the scope trusted host composition grants. User
handlers cannot forge core or add-on events. Their commands produce events through
the called capability's normal workflow. There is no universal arbitrary-event
command in v1.

Runtime packages add a versioned extension section to the portable manifest:
provided hook/command definitions, handlers/subscriptions, required/optional
hook dependencies, and exact SDK/runtime requirements. Its integrity is covered
by package hashes. Host registration validates ownership, duplicates, schemas,
dependency compatibility and budgets before atomically publishing a new registry
snapshot. Old snapshots/artifacts remain available for referenced deliveries.
Registration failures do not partially enable new hooks.

Optional missing dependencies produce an explicit inactive binding. Required
missing/incompatible dependencies prevent enable. A runtime installation updates
the registry without an application restart. Core and add-on definitions are
available before setup completion is evaluated; subscribing after setup does not
replay it. Late add-on initialization belongs to explicit enable preparation or
the add-on's enable event as appropriate.

Add framework-independent values/interfaces to a new versioned SDK subpath such
as `@zarya/addon-contracts/hooks`. This does not retroactively change the meaning
of existing contractVersion 1. A new host extension-contract version and exact
supported SDK/package versions must be declared. Packages with unsupported
requirements reject explicitly; no legacy bundle is silently assumed to emit
reliable events. Concrete host adapters and transaction integration remain
outside that SDK.

### 4.2 Check contract

`ICheckInvocation` contains hook ref, proposed operation identity, trusted scope,
captured subject/business version, bounded candidate summary/detail access,
actor audit reference, exact configuration and invocation deadline. There is no
command bridge. Pure calculations and declared read-only queries are permitted.

`ICheckOutcome` is a closed result:

- Allow: successful read-only validation.
- Deny: stable reasonCode, localized public reason parameters and optional safe
  administrative diagnostic; no raw exception or private data.

Execution error, timeout, invalid result and missing required implementation are
failures, not Allow or an empty Deny. Checks run in ascending priority then stable
subscription identity. First Deny stops evaluation. An Allow cannot override a
prior denial. All checks use the same proposed operation snapshot; a mutable
query is explicitly identified as a current read, not a consistency guarantee.

An Allow permit binds scope generation, registry version, operation/candidate
digest and checked source version. The owning commit validates those fences and
its business concurrency guards. A permit cannot authorize a different operation.

Administrative disable of a handler/subscription/add-on is a recovery mechanism:
user/add-on checks cannot veto that disable, its own registration repair or
maintenance quiescence. Existing authorization and core lifecycle rules still
apply. These operations have after-events but no extensible blocking check in v1.

### 4.3 Event envelope and large changes

`IHookEventEnvelope` exposes the immutable part of HookEvent. Actor references
are discriminated Administrator, LocalOperator, Handler or System; a handler
reference additionally records the causal execution. Installation identity,
scope and producer are supplied by trusted composition, never body fields.

Schema versions are exact positive versions per named hook. Changing payload
meaning/type requires a new version. Existing events retain their original
schema; consumer declarations list supported versions. Public SDK evolution and
hook schema evolution are separate concerns.

Large routing/release/import changes expose typed detail pages, with immutable
ordinal cursors bound to event identity/generation. Event details never query
draft state to reconstruct what happened. Event-level and detail-level consumers
are explicit subscription modes. All generated unit deliveries preserve their
source event identity and deterministic unit key.

### 4.4 Event handler and command-plan contracts

`IEventInvocation` contains the event or declared detail unit, exact configuration,
delivery/execution identities, original implementation reference, scoped query
grants and deadline. Event-snapshot queries return immutable captured values;
current business queries are labelled current and can differ on a retry.

`IEventHandlerResult` contains bounded diagnostics and an ordered bounded command
plan. Every command has a unique plan-local commandKey, exact command/schema ref
and typed arguments. Scope/actor/grants/idempotency keys are injected by the host,
not accepted from the script. No direct state changes occur during evaluation.
Zero commands is a valid explicitly evaluated result, not a missing implementation.

The host validates the entire plan, configuration and current grants before
persisting it and executing commands. Failure before plan acceptance has no
command effects. After acceptance, recovery retains the same plan. A delivery
succeeds only after every requested command has a confirmed successful outcome.

User code executes in a separate bounded worker with a narrow serialized query
bridge; it has no module imports, Nest services or process APIs. As with current
Snippets, this is constrained execution for trusted administrators, not a claim
of OS isolation against hostile native code. Trusted add-on code uses its
registered application implementation and explicit ports; it still obeys
scope/availability/idempotency contracts.

### 4.5 Initial command surface

Register commands explicitly, mapped to inbound business operations. Do not
automatically expose every existing use case.

| Proposed v1 command | Semantics / condition |
| --- | --- |
| `cms.page.create` | Create a site-owned draft with a durable idempotent result |
| `cms.page.update` | Update captured draft fields under expected business version |
| `cms.page.configure-rendering` | Configure an owned draft through the normal rendering contract |
| `cms.page.archive` | Archive through the normal lifecycle; does not imply URL deletion or unpublication |
| `cms.url.assign-initial` | Explicit initial address assignment with ownership/uniqueness guards |
| `cms.url.change` | Existing approved URL move choices and routing application semantics |
| `cms.redirect.set` | Create/change redirect behavior through the existing owned URL operation |
| `cms.publication.publish-page` | Explicit page publication and release activation, preserving its partial/unknown outcome semantics |
| `cms.publication.publish-site` | Explicit full-site build/activation under captured authority |
| `addon.<key>.<operation>` | Only the installed add-on's declared versioned command and its own policy |

These are candidates for registration, not a claim that existing operations are
already safe hook commands. Existing page updates without a sufficient expected
version/idempotency contract need that contract agreed and implemented first.
No new URL deletion or physical page deletion operation is introduced merely
to fill the table. Those commands become available with their approved owning
workflows. System administration, arbitrary scripts/SQL/Mongo filters, package
installation, dump restore and editing/applying hook handlers are not script
commands in v1.

Publication commands require special care: if a version/URL committed but release
activation failed, a retry resumes the acknowledged publication/routing stage;
it must not create another page version or repeat a URL move. Until the owning
workflow has a durable resumable operation contract, expose it as requiring
reconciliation rather than advertising automatic safe retry.

### 4.6 Delivery, ordering and availability

1. Validate authority and the proposed operation, run checks and prepare facts.
2. Commit the business mutation, source event sequence/envelope/details and any
   idempotent command receipt together. Recipients are captured under a registry
   fence. No-op and rolled-back writes have no changed-event.
3. Dispatch each scope's committed events in sequence order. Recipient expansion
   is resumable and idempotent. Do not dispatch the next event until the previous
   event's recipients/detail units have all been assigned lane positions.
4. Claim only an available lane head under its fence. Evaluate the exact code,
   persist the plan, execute/reconcile commands and commit the outcome.
5. Settle the lane only on Succeeded, explicit Skipped or Superseded. Failed and
   OutcomeUnknown block later work in that lane. RetryScheduled waits until due.

Disable commits with the shared availability/registry fence. Source commits which
win before disable retain their recipient snapshots even if fan-out happens later.
Source commits which win after disable exclude bindings of that consumer.
Already accepted work becomes Paused; in-flight pure evaluation is cancelled and
new commands stop. A command that committed before disable retains its outcome;
disable does not pretend to undo it. Commit-time capability/add-on fences arbitrate
the race. Recording a receipt for an already committed effect remains permitted.

Re-enable automatically wakes old paused work in its original order and with its
original source/configuration. Original implementations must still be available
and current policy may deny effects. No event from the disabled interval is
invented or replayed. Resume preserves a previously scheduled retry deadline and
does not reset an already exhausted failure into an automatic retry. Missing
artifacts/dependencies remain visibly Paused with their own reason.

Disabled site connections have no automatic new hook reactions, including
maintenance reactions. Existing administrative maintenance operations retain
their normal AddonOperationAccess.AdministrationRetained contract; they are not
background subscriptions. Mandatory disable preparation/cleanup belongs in the
explicit owning disable workflow, not a reaction sent to an already disabled
consumer. Other enabled observers may receive its disable event.

Registry-changing operations select recipients against their intended resulting
availability, guarded by the prior registry version and committed with its change.
Thus an enabled add-on may receive its own enable event if it declares that
binding, while a disabled one does not receive a new own disable reaction.
Applying a new version of an enabled custom handler captures that new version
for subsequent facts, without migrating already accepted work. Definitions and
recipients needed by the transition are validated before changing availability.

Delivery is at least once for accepted recipients, with durable reconciliation,
not an exactly-once arbitrary-effects guarantee. Attempts/leases may repeat;
safe command effects use their owning idempotency receipts. There is no ordering
guarantee across different logical handlers, unrelated aggregate identities or
sites. Different subscriptions of the same logical handler share its subject lane.

### 4.7 Causality and recursion

Root operation/correlation identity is retained across handler commands. Each
produced event records its causal command/execution and incremented depth.
Per-chain depth/work budgets reject further commands before their effects, with
a visible CycleOrBudgetExceeded result. A new eventId alone does not count as
proof that a self-triggering loop is safe.

No implicit republish-on-publication subscription, handler self-edit command or
arbitrary synthetic event emission is installed. A manifest can opt into a
documented causal workflow; it remains responsible for convergence and normal
business invariants. Idempotency keys prevent repeating an effect, not every
possible logical loop involving different operations.

### 4.8 Failures and REST boundary

| Outcome | Administrative boundary |
| --- | --- |
| Invalid schema/source/configuration/filter/capability | Validation / 400 with safe source diagnostics where applicable |
| Missing or foreign resource | Scoped NotFound / 404; authority is checked independently |
| Unauthenticated / forbidden | Existing 401 / 403 semantics |
| Stale root/binding/registry/version or idempotency conflict | 409; no silent overwrite |
| Check Deny | 409 with stable HookDenied reason and safe explanation |
| Mandatory check/runtime unavailable or timed out | 503; the gated mutation does not run; earlier acknowledged workflow stages remain |
| Successful source mutation; reaction Pending/Paused/Failed | Source operation retains its real success; delivery status is separate |
| Source's existing partial publication outcome | Existing 202/pending-activation semantics; no public-success event |
| Command outcome uncertain | OutcomeUnknown and reconciliation; no automatic claim of failure/success |
| Maintenance or unresolved restore | Existing maintenance boundary; no ordinary claims/mutations |

Proposed errors owned by Hooks: HookDenied, HookUnavailable,
HookContractMismatch, HookBudgetExceeded, HookImplementationUnavailable,
HookOutcomeUnknown, HookLaneBlocked and HookGenerationChanged. General
Validation, Forbidden, NotFound, StaleWrite and IdempotencyConflict reuse existing
business meanings. Typed error definitions are versioned with the SDK when they
cross the add-on boundary.

REST lives under `/api/admin/sites/:siteId/hooks/...` for site handlers,
subscriptions and history. Global installation hook history is a separate global
administrator route; it never accepts an arbitrary site context. Existing
Host/Origin/cookie/custom-header/no-store policies apply. All lists use explicit
bounded keyset pagination; cursors bind filters, scope and stable tie-breaker.
No management REST controller owns workflow orchestration.

### 4.9 Budgets and proposed operational defaults

These are proposed values for agreement, not changes to current transport limits:

| Boundary | Unit | Proposed v1 limit |
| --- | --- | --- |
| Draft source | UTF-16 code units | 100000, matching current Snippet source ceiling |
| Configuration per binding | Encoded UTF-8 JSON bytes | 16 KiB |
| Event summary or detail item | Encoded UTF-8 JSON bytes | 64 KiB each |
| Matched event recipient snapshot | Bindings per event | 128; admission checked when configuring/activating bindings, never silently truncated |
| Single worker input or result | Encoded UTF-8 JSON bytes | 2 MiB, matching current Snippet result ceiling |
| Commands in one accepted plan | Commands | 32 |
| Check invocation | Elapsed time | 1000 ms per check; 5000 ms total extension-check budget per source operation |
| Event evaluation | Elapsed time | 10000 ms; command deadlines remain their owning operation's contract |
| Script worker | Memory | Existing Snippet profile: 64 MiB old generation, 16 MiB young generation, 4 MiB stack |
| List/detail page | Rows | Default 50, maximum 200, stable keyset cursor |
| Safe automatic retries | Attempts | 5 total, after 10 s, 1 min, 5 min and 30 min; original execution counts as attempt 1 |
| Causal chain | Depth / total handler commands | 16 / 256, durably accounted by the root chain before command execution |
| Settled history | UTC elapsed retention | 90 days; reference-aware, never expires unfinished work |

Closed enums own resource/retry profiles rather than accepting arbitrary runtime
options in a script. Enforce the actual encoded maximum for the entire event
record, including recipient snapshots, under MongoDB's document boundary. Large
business changes use detail units; limits never silently truncate business results.
If configured profiles cannot fit the operation contract, subscription activation
rejects explicitly instead of enabling a handler which every legitimate event
would necessarily overflow. Database allocation/capacity failure may still fail
the source transaction; it must not lose an acknowledged fact.

Command/external deadlines, lease renewal and worker concurrency are separately
validated process settings. A lease is not permission to execute after its expiry;
all result/effect commits compare its fence. Limits and units must be added to
transport-limits.md when the corresponding boundary is actually implemented.

Quiescence cannot cancel an already issued irreversible external request by
revoking a local token. Before restoring its affected state, the owner must wait
for/reconcile that request or refuse to report a drained maintenance barrier.
An unresolved external effect is a real blocker to replacement, not evidence
that fencing alone made the outside world roll back.

### 4.10 Core hook catalogue and payload semantics

All names below use schema version 1. Payloads contain the listed business values
in addition to the common envelope; fields duplicated by scope/subject are not
required to be repeated in payload. References use owned opaque identities.
Changed-field lists use a closed field enum, not arbitrary database property paths.

The installation-scoped `cms.site.create.check` and `cms.site.created` describe
creation of a site which has no existing site subscriptions. Their code-owned
installation consumers receive only explicitly granted topology metadata; this
does not enable a business add-on for the new site or grant cross-site business
access. Other site lifecycle hooks use the site's scope. A user can subscribe to
that site's later setup completion once the handler/binding exists. Installation
consumers do not automatically observe all site-scoped page or business events.

| Event hook | Commit point and payload/detail contract |
| --- | --- |
| `cms.installation.setup.completed` | Installation completion transition; setupContractVersion and completedAt; Installation subject/scope |
| `cms.site.created` | Installation-scoped topology fact after site creation; createdSiteId, name, languages/defaultLanguage and selected address summary; no account/settings secrets |
| `cms.site.setup.completed` | Site completion transition; setupContractVersion and completedAt |
| `cms.site.settings.changed` | Confirmed settings update; changedFields and whitelisted prior/resulting values, including IANA timeZone where changed |
| `cms.site.domains.changed` | Confirmed domain/address update; prior/resulting serving-origin and registered domain summaries |
| `cms.site.archived` | Confirmed site status transition; prior/resulting status; not a promise of content removal |
| `cms.page.created` | Confirmed draft creation; pageNumber, language, type, parentPageId and initial status; full content is excluded |
| `cms.page.draft.updated` | Confirmed draft-content/metadata change; changedFields and captured before/after state digests; no new revision-management workflow |
| `cms.page.moved` | Confirmed page-tree change; prior/resulting parentPageId and sortOrder; URL hierarchy remains separate |
| `cms.page.rendering.configured` | Confirmed rendering change; prior/resulting template reference, delivery/interaction policies and binding-name summaries; no secret loader arguments |
| `cms.page.archived` | Confirmed page archival; prior/resulting status; neither physical deletion nor automatic unpublication |
| `cms.page.version.restored` | Confirmed retained-version restoration into the draft; selected retained position, restored snapshot digest and draft digest; active release/URLs unchanged |
| `cms.page.version.published` | Confirmed content-version retention; publishedAt and immutable snapshot digest; does not mean public release activation |
| `cms.release.prepared` | Immutable Ready artifacts/manifests verified and staged; releaseId, reason, content/route counts and manifest digest; no public-success implication |
| `cms.release.activated` | Authoritative active-pointer/activation receipt commit; priorReleaseId, releaseId, activation reason and frozen publication/route details |
| `cms.url.created` | Working routing commit inserts a new URL identity; path, kind, page binding and parent URL identity |
| `cms.url.path.changed` | Same URL identity receives another path; prior/resulting path; emitted only if the owning operation actually preserves identity |
| `cms.url.parent.changed` | Working routing relationship changes without implied content publication; prior/resulting parentUrlId |
| `cms.url.page-binding.changed` | Working page binding changes; prior/resulting pageId and URL kind |
| `cms.url.deleted` | Working identity/history removal confirmed; removed path/kind and relationship summary retained in event |
| `cms.redirect.created` | URL becomes Redirect or is inserted as Redirect; targetUrlId and redirectStatus |
| `cms.redirect.target.changed` | Existing Redirect changes destination; prior/resulting targetUrlId |
| `cms.redirect.status.changed` | Existing Redirect changes HTTP status; prior/resulting status |
| `cms.redirect.deleted` | URL ceases to be Redirect or its identity is deleted; prior target/status and disposition reason |
| `cms.routing.changed` | One atomic working graph mutation confirmed; changeId, reason and exact counts; immutable details contain every inserted/changed/deleted URL delta |
| `cms.element.created` / `cms.element.updated` | Confirmed Template/Chunk/Snippet source save; kind, stable key, display name, business version/digest and backup state; code/text excluded by default |
| `cms.media.upload.accepted` | Owning upload workflow durably accepts a file; media identity, type, size and immutable version reference; not a Ready claim |
| `cms.media.version.ready` | Derivatives/metadata verified and Ready committed; version, content hash, dimensions/profile summary where relevant |
| `cms.media.moved` | Confirmed library move; prior/resulting library-relative path and retained identity |
| `cms.media.deleted` | Confirmed explicit deletion permitted by reference/lifecycle checks; prior path/version references |
| `cms.addon.package.installed` | Verified package and durable active registration confirmed; addonKey, implementationVersion and artifact digest; installation scope, not emitted again on bootstrap |
| `cms.addon.enabled` | Connection enabled; addonKey, connection identity/version and first-enable/re-enable indicator; configuration secrets excluded |
| `cms.addon.configuration.changed` | Connection configuration committed; addonKey, schemaVersion and changed-field summary only; not a static publication |
| `cms.addon.disabled` | Connection disabled; addonKey and connection version; the now-disabled add-on does not receive a new own reaction, but enabled observers may receive it |
| `cms.dump.created` | Archive finalized and catalog-visible; type, private archive identity, byteSize and checksum; no extra dump database entity |
| `cms.dump.uploaded` | Archive upload accepted/verified; archive identity/type; does not imply data application |
| `cms.content.imported` | Selected category content replacement/merge completed; category, counts and typed changed-identity details; drafts remain unpublished |
| `cms.site.restored` | Complete same-site DB/file restoration confirmed under the new generation; restoration operation identity and restored snapshot digest |
| `cms.hook.handler.applied` | Active handler pointer/version changed; handlerId and prior/resulting active version refs |
| `cms.hook.handler.enabled` / `cms.hook.handler.disabled` | Confirmed handler enable transition; handlerId; disabling cannot be vetoed by extensible checks |
| `cms.hook.subscription.changed` | Confirmed binding creation/configuration/enable change; subscriptionId and operation kind; no source/configuration secrets |

Page and element physical deletion, site reactivation, release rollback and new
URL removal commands are not invented here. Their exact hooks are added when
the corresponding owning use case/semantics are agreed. A name may be reserved
but is never advertised as an executable supported operation prematurely.

Publication activation reasons are the closed set PagePublication,
SitePublication and RoutingApplication for currently supported flows. Routing-only
activation never re-emits page.version.published or rebuilds Build Snippets.
Repeated activation acknowledgement recovery returns the original receipt and
event identities. A failed preparation/activation has diagnostic execution
history; there is no generic failed-success-fact or inference from a lost response.

Routing detail records are tagged Inserted, Updated or Deleted with URL identity,
bounded prior/resulting state and semantic change kinds. A move that allocates
replacement identities emits creation of the replacement and conversion/deletion
of the original, not a fictitious same-identity path change. Converting an existing
PAGE URL to REDIRECT emits redirect.created, not url.created. Deleting a Redirect
URL emits both url.deleted and redirect.deleted with the same changeId and
different factKeys. A consumer subscribing to both intentionally gets two facts.

Within one routing mutation, url/redirect fact ordering is deterministic by
affected URL identity and defined semantic fact order, followed by routing.changed.
Within a compound workflow, facts follow actual committed stages; a later stage
failure never erases an earlier confirmed fact. Element database source saves and
private-backup synchronization also remain distinguishable; an element.updated
event does not falsely claim the backup is Ready when it is still Pending.

For import/restore, emit the aggregate completed operation instead of replaying
synthetic page/URL/business create events. A complete restore emits only the
restoration fact for the replaced state. A selective import uses content.imported
with immutable details. It does not publish, rerun old bookings, recreate setup
completion or reactivate old operational queues.

Checks use explicitly named operation keys ending in `.check`, not mechanically
generated before/after pairs for internal methods:

- `cms.installation.setup.complete.check`, `cms.site.setup.complete.check`.
- `cms.site.create.check`, `cms.site.update.check`, `cms.site.archive.check`.
- `cms.page.create.check`, `cms.page.update.check`, `cms.page.move.check`,
  `cms.page.configure-rendering.check`, `cms.page.archive.check`,
  `cms.page.restore-version.check`, `cms.page.publish-version.check`.
- `cms.publication.publish-page.check`, `cms.publication.publish-site.check`,
  `cms.release.activate.check`.
- `cms.routing.change.check` over the complete proposed routing delta, shared by
  initial assignment, rebind, redirect setting and graph moves. It includes the
  initiating operation kind; arbitrary partial per-URL checks cannot miss an
  invariant of the final graph.
- `cms.element.create.check`, `cms.element.update.check`,
  `cms.media.upload.check`, `cms.media.move.check`, `cms.media.delete.check`.
- `cms.addon.enable.check`, `cms.addon.configure.check`,
  `cms.content.import.check`, `cms.site.restore.check`.

Publication workflow checks run before the first workflow mutation; a version
check runs before its own content commit and activation checks before pointer
switching. Denial at a later stage does not undo earlier acknowledged stages.
Resume of a partially completed publication rechecks current activation authority
and guards, not the already committed version creation.

Hook management/recovery disable and maintenance entry have no extensible veto.
Dump generation/download and read-only previews do not need arbitrary blocking
checks in v1. File/archive validation and mandatory host policies remain normal
owning use-case responsibilities even without extension hooks.

### 4.11 Observable verification contracts

Future implementation needs focused fake-port, adapter, composition and isolated
integration coverage for the affected behavior, following the
[testing policy](../cms-development/testing-policy.md):

- All-or-nothing source mutation + event record; abort, lost acknowledgement and
  recovery without duplicate facts or repeated URL moves/page versions.
- Check Allow, Deny, timeout, missing implementation, source/registry stale guard
  and a concurrent change of a checked foreign dependency.
- Two workers claiming one lane head; expired worker completion/effect rejected;
  unrelated lane progress while one is blocked.
- Original event order despite delayed/partial fan-out; event/detail unit order;
  strict ordering across handler version activation.
- Disable races at source capture, recipient dispatch, evaluation and command
  commit; no new disabled-interval backlog; old paused work automatically resumes.
- Exact source/configuration replay, missing old package, original/current grant
  intersection and no latest-code substitution.
- Safe command retry, changed argument digest, partial command-plan completion,
  timeout with unknown effect and reconciliation using owning receipts.
- Cross-site event/query/command isolation, forged scope/actor/producer rejection,
  and public requests never acquiring local-operator authority.
- Large routing/publication/import details without truncation, frozen snapshots
  and no duplicate semantic creation events.
- Same-site restore success/rollback/unknown outcome with workers quiescent,
  generation fencing, restored source versions and one restore event.
- Setup completion idempotency, adoption without historical events, restart not
  completing setup and late subscriptions not replaying setup.
- Loop/size/time/capability limits and reference-aware retention of paused work.

These are proposed acceptance requirements. No Red/Green, tests, migrations,
runtime guarantees or performance results are claimed by this design document.
