# Hooks runtime contracts

The accepted decisions are recorded in [ADR 0043](../adr/0043-cms-hooks-and-durable-handlers.md).
The earlier hooks-contract-proposal.md is design discussion; this document
describes the implemented boundary.

## Storage and scope

The main migration owns thirteen explicit collections:

| Collection | Responsibility | Dump role |
| --- | --- | --- |
| cms_installations | Installation identity and once-only setup marker | Global |
| hook_registrations | Provider definitions and original registration instant | Global |
| hook_handlers | Site handler title, draft, enablement and active version | SiteContent |
| hook_handler_versions | Immutable applied source and compiled digest | SiteContent |
| hook_subscriptions | Site binding, order, filters and frozen policy | SiteContent |
| hook_scope_states | Registry fence, generation and exact source sequence | Runtime |
| hook_events | Committed facts and immutable recipient snapshot | Runtime |
| hook_event_details | Ordered routing deltas for detail subscriptions | Runtime |
| hook_execution_chains | Causal depth and command reservation budget | Runtime |
| hook_delivery_lanes | Per-consumer/subject ordering position | Runtime |
| hook_deliveries | Leases, attempts, plan and execution state | Runtime |
| hook_executions | Check and event attempt journal | Runtime |
| hook_command_executions | Stable command keys and effect receipts | Runtime |

Every site-owned record carries siteId. Installation records discriminate their
scope and forbid a site identity. Sequence and lane positions use BSON long;
transport uses decimal strings. All instants are UTC BSON dates. The UI formats
registration instants in the site's configured IANA time zone.

The migration validators reject unknown top-level fields. Uniqueness covers
applied versions, provider keys/schema versions, event identities, recipient units,
lane positions and command keys. Automatic schema/index creation remains disabled.

## Domain and ports

`domain/hooks` owns source, definition, subscription, recipient, fact, commit
intent, delivery and command outcome contracts. `installation` owns the setup
state; existing site state carries its own setup marker. Routing owns the policy
deriving URL and redirect facts from before/after routing snapshots.

Inbound configuration operations list/get/create/update/apply/enable handlers,
save subscriptions and reorder complete binding lists. History, explicit retry
and safe skip are separate operations. Each administrative operation verifies
an active administrator or explicitly trusted local operator and site ownership.
All updates carry expected opaque versions; stale writes reject.

Outbound ports provide configuration storage, access, values, compilation,
check/runtime evaluation, event capture, delivery/receipt storage and explicitly
registered commands. Source operations use IHookChangesPort.prepare and pass
the resulting commit intent to their owning persistence operation. No MongoDB
session crosses the domain/application/port boundary.

Creation returns a disabled draft. Apply validates/compiles a captured draft and
creates an immutable version; saving a draft does not affect active code.
Enable requires an applied implementation. Bindings require matching kind and
schema version, same-site handler ownership and a registered available hook.
Configuration is bounded JSON; filters use top-level scalar equality. Detail
delivery is supported for cms.routing.changed. Reordering reads and validates the
complete identity/version list within its transaction and registry fence; a new
binding cannot be omitted by an older projection. Add-on source remains code-owned.

## Emission points

The registration catalogue is derived from implemented emission points:

* Global: site.created, installation.setup.completed; checks site.create.check
  and installation.setup.complete.check.
* Site: site.setup.completed, site.settings.changed (including domain/origin
  settings), site.archived; checks site.setup.complete.check, site.update.check,
  site.archive.check.
* Pages: page.created, page.draft.updated, page.moved, page.rendering.configured,
  page.archived, page.version.restored, page.version.published; checks page.create,
  update, move, configure-rendering, archive, restore-version, publish-version
  with the `.check` suffix.
* Publication: release.activated and release.activate.check, including the
  routing-only release path. Saving a draft never emits public activation.
* Routing: url.created, path.changed, parent.changed, page-binding.changed,
  deleted; redirect.created, target.changed, status.changed, deleted; routing.changed
  and routing.change.check. Replacing a URL identity produces deletion/creation;
  changing a property preserves its identity. Large changes retain detail rows.
* Elements: element.created, element.updated and element.create.check,
  element.update.check for templates, chunks and snippets.
* Add-on connections: addon.enabled, addon.configuration.changed, addon.disabled;
  checks addon.enable.check and addon.configure.check. Disable itself cannot be
  vetoed by the consumer being disabled.
* Import/restore: content.imported, site.restored; content.import.check,
  site.restore.check. Full restore invalidates the prior generation.

All keys above have `cms.` prefix and schemaVersion 1. Pages use the CMS's existing
archive operation; a new hard-delete operation is not introduced. Media lifecycle,
dump creation/upload and handler configuration audit events are not registered
as executable hooks in this version.

The events add-on declares its own `addon.events.session.*` hooks for
created, cancelled, page.changed and removed, with their corresponding checks.
It does not invent business reactions to unrelated CMS events.

## Execution and recovery

HookRecipientsService owns recipient selection through IHookRecipientSourcePort. The
MongoDB source adapter binds the current technical session, including restoration;
composition does not decide recipient eligibility. Ordering and limits are shared
by user and code-owned recipients.

Preparation validates bounded candidate/fact JSON, captures current enabled
recipients and evaluates checks in priority/identity order. A denial aborts the
source operation with HookDenied and a bounded safe explanation. Invalid results,
exceptions and unavailable implementations return HookUnavailable. Check outcomes
are journalled even when the source does not commit.

The source commit fences scope generation and registry version. A concurrent
disable, apply or subscription change rejects the stale source write. The same
transaction records the fact and snapshot; an aborted source has no event.

The hook transaction boundary, page-version publication and routing persistence
allow at most two further attempts after a confirmed aborted write conflict,
waiting 50 ms and 100 ms. They retain the captured predicates and prepared hook
intent. This handles contention with dispatch without replaying check handlers,
commands or external work. Unique-index/stale-version conflicts are not retried;
once commit starts, an uncertain outcome is propagated for reconciliation.
The [numbered rendering creation and backup acquisition](rendering-element-editing.md)
transactions allow up to seven further attempts for the same confirmed abort
class. Backup synchronization stops replay once its filesystem callback begins.

The dispatcher expands recipients into deterministic delivery identities and
assigns exact per-consumer/subject lane positions. Claims use leased ownership
and atomic scope/lane fences. Other processes may run other lanes. Initial
priority ordering waits for an active attempt; errors, suspended consumers and
their pending retries do not block unrelated consumers.

Evaluation is pure: the bounded worker receives JSON, returns allow/reason or a
command plan and can call only granted scoped queries. Completion fences later
messages, requests cooperative query cancellation and settles admitted queries
and worker termination before returning. The worker CPU deadline does not release
ownership of host I/O: uncancellable query ports are awaited under their dependency
deadlines. Unexpected late query failures propagate; expected cleanup cancellation
does not discard an otherwise completed result. The bridge exchanges JSON
strings and exposes no callable objects from the host realm. An entire validated
plan is persisted before the first command. Successful command keys are skipped
on retry. The current applied grant and original captured grant must both allow
the command, and the originating handler/binding must still be enabled at commit.

The default command registry has `cms.page.create`, `cms.page.update` and query
`cms.page.get` (grant `query.cms.page.get`). Command arguments cannot inject a site,
actor or installation identity. These commands call the owning CMS use cases,
run their checks and produce their normal events with causal identity/depth.

Safe automatic retry has five total attempts, delayed 10 seconds, 1 minute,
5 minutes and 30 minutes. A known terminal failure holds only its own lane.
History exposes the latest 200 site deliveries with state, attempts, version and
safe error. Explicit retry requires the displayed version. For OutcomeUnknown,
the supplied atomic page commands reconcile their persisted source receipt;
unknown external command providers reject until provider recovery is implemented.
Safe skip refuses unresolved effects and must settle the lane head. A command
explicitly rejected before effects is a known failed receipt, not OutcomeUnknown;
it must not make safe skip wait for nonexistent effects. A fatal abort failure
preserves both causes and stops host transaction replay.

Disable preserves source/configuration and previous deliveries. It prevents new
recipient capture, pauses existing work and revokes command authority. Reenable
resumes captured versions without backfilling the disabled interval. Missing
original code fails visibly instead of silently substituting the newest version.

## Administration and SDK

Hooks is a top-level site section. Its drawer starts with collapsed hook nodes;
disclosure and selection are separate controls. Children show execution order.
Hook details expose provider, registration instant, type and binding count.
Handler details expose Title, attached hook, draft source, applied version and
explicit Save draft / Apply / Enable controls. Per-site tree and editor positions
remain mounted while details load. Installation assignments are code-owned.

SDK 0.3.0 exports pure hook definitions, handler descriptors and source contracts
from `@zarya/addon-contracts/hooks`. Add-on runtime extensions are validated before
registration, namespace checked and compiled through the same source boundary.
The host bridge validates add-on ownership at preparation/transactional recording.
Use fixed-version artifacts with lockfile integrity; no sibling runtime imports.
