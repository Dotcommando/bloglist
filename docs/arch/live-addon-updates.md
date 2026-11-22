# Live add-on updates

The installation coordinator owns update admission, immutable package selection
and process supervision. It reads manifests but never evaluates installed add-on
code. Serving processes and a replaceable administrative control process execute
add-ons. See [ADR 0088](../adr/0088-live-addon-updates.md).

## Administration

An installed add-on card shows its selected version, site connection and update
source. System Admin can check its connected GitHub source, connect a source to
the exact active package, or open the file form for a prebuilt `addon.runtime.gz`.
Check for updates reads the completed GitHub
installation claim, verifies the latest stable package against the selected
runtime, and prepares an immutable candidate if the manifest declares a newer
applicable version. Equal or older versions return Current. Add-ons without a
completed repository claim can use the file form. The check registers as
`cms.addons.check-update` for System Admin. It performs no code evaluation or
activation. A clear second click applies the prepared identity globally, preserving
every site's connection, configuration and business records. Both sources use
the card's review of versions, update mode and installation-wide effect. A
package for another add-on cannot be applied through the selected card. Only an active global
administrator may prepare, inspect or apply installation-wide updates.

| Operation | Route | Input |
| --- | --- | --- |
| Check repository | POST `/api/admin/addon-updates/repository/:addonKey` | Add-on key in path, empty body. Returns `NoRepository`, `Current` or `Available` with the proposal |
| Prepare | POST `/api/admin/addon-updates` | Streamed gzip body; exact Content-Length; at most 64 MiB compressed |
| Status | GET `/api/admin/addon-updates/:updateId` | Prepared identity |
| Apply/reconcile | POST `/api/admin/addon-updates/:updateId/apply` | Empty body |

The current session, trusted Host/Origin and administrative headers are checked
before consuming an upload. Responses are private and no-store. Preparation never
evaluates server code, applies migrations or enables a connection. Files use the
existing runtime archive framing and expansion limits. Arbitrary server paths
are not accepted over HTTP.

Apply waits for completion. A disconnected or lost HTTP response does not cancel
an admitted update. Read status and retry the same identity to reconcile the
outcome; do not infer that a timeout means no effect. The administration retains
the identity locally for status checks after a reload. It resumes unresolved
updates beside the affected add-on and clears a completed identity from the
active screen. Completed retries preserve their acknowledged result. Private final-state receipts preserve older outcomes
when a later update starts.

## Package contract

An update manifest declares `update: {fromVersion, mode}`. `fromVersion` equals
the selected implementation version. The candidate implementation version is
strictly greater; mode is `Compatible` or `Exclusive`. Configuration schema
versions must remain equal: automatic connection-configuration conversion is
not part of this API. `routes` contains at most 32 API prefixes, with named
parameter segments such as `/api/admin/sites/:siteId/example`. Prefixes describe the owning add-on API namespace; existing URLs need not
contain the add-on key. Root authentication, installation, update, health and
broad site-management namespaces remain reserved. Paused workers use this declarative metadata to
return 503 without evaluating the paused package.

The [add-on Action declaration](../addon-development/authorization.md#declare-endpoints-and-domains)
defines the method and route template behind each prefix. The catalog switches
to the new digest in the same MongoDB transaction that confirms the update.
During a compatible rollout, the other digest is admitted only if the recorded
update pairs it with the catalog digest and its Action boundary is unchanged.
New Actions become available at completion. Removing an Action or replacing
its ID requires an exclusive update. A failed update leaves the last confirmed
catalog and grants intact while recovery follows the update state.

Within an add-on major version, migration checksums and applied files remain
unchanged and new migrations append by increasing four-digit filename. A new
major version with owned collections uses one `0000-runtime-v<major>.json` and
an Exclusive update. Its `replaces` mapping authenticates the exact installed
migrations and the previous baseline's retained history. Installed migration
receipts are preserved. The coordinator reconciles and verifies owned collections
before recording the new baseline and activating the runtime. Fresh installs
apply the same baseline to empty collections. Migrations cannot claim core
or another add-on's collections, remove retained ownership or invoke core data
transforms. Every declared collection has an owned site-scoped schema. New
migration bytes use LF; historical applied bytes are never normalized.

Compatible updates require an explicit publisher guarantee that old/new code and
data may overlap. A conservative schema check additionally rejects changed
existing property types, new required fields, changed/removed indexes and new
unique indexes. Optional fields and ordinary added indexes can remain compatible.
Record backfills and removed indexes require Exclusive mode. Backfills use the
existing owned migration field-copy contract; no arbitrary migration JavaScript
runs in the coordinator.

SDK 0.5.0 adds the optional shutdown contract. Retained SDK 0.4.0 packages remain
bound to the pinned original contract archive in `packages/retained-contracts`.
Business-error and validation modules use the canonical host identity; their
implementation bytes are unchanged between these two SDK releases. Other exact
dependency/version checks remain effective. Installed package bytes are not
rewritten to change their SDK declaration.

## Execution and failure boundaries

A created runtime rejected for invalid extensions/handler shape invokes its
provided callable disposer before activation rejects. Validation and disposal
failures remain separately observable; the invalid runtime is not selected.

Compatible updates apply their compatible migrations, atomically select the new
digest and replace processes one by one. Every replacement becomes ready before
its predecessor leaves selection. Even a site assigned one process temporarily
has two. The desired allocation remains unchanged.

Exclusive updates first persist a global admission pause in
`addon_runtime_controls`. This happens before waiting on old business
transactions. Workers replace the affected add-on with metadata-only paused
handlers while core pages and other capabilities continue serving. Once old work
has drained or its process has been killed, the transactional connection fence
invalidates previously issued permits, then owned migrations run. CMS selects
the candidate and replaces paused workers with the new runtime. Admission resumes
only after successful replacement. Enabled/Disabled settings and configuration
are preserved; business connection versions change at the fencing boundaries.

For each retiring process the host sends the add-on a shutdown notification with
reason Update, a UTC epoch deadline and an AbortSignal. The total retirement
budget is 20 seconds. Requests already admitted by the gateway retain their old
process; new requests use ready replacements. Final drain seals runtime admission,
waits for tracked operations and disposes resources. At the deadline the
supervisor forcibly terminates the process and records the forced count. This
also handles synchronous blocking code. Forced termination can end other work
sharing that retiring process; uncertain writes use their own reconciliation
contracts. The coordinator and public listener remain running.

Resource allocation, calibration and dump-process borrowing cannot compete with
an admitted update. Desired process counts, database pools and CPU settings are
not silently changed. Control-worker resource requests go through private IPC to
the coordinator, which retains ownership of resource leases after child failure.

A failed migration or activation leaves the target paused, with the selected
bytes and applied migration receipts retained. There is no automatic schema
rollback. An interrupted operation can be continued with its prepared identity.
A corrected higher version can repair a Failed operation after validation against
all applied receipts. Core bootstrap can serve a paused add-on from metadata
without evaluating failing code. Historical installation/repository claims remain
immutable records of the original install; they are not the current runtime
version catalogue. There is no uninstall or business-data purge in this workflow.

## Verification

Focused tests cover admission, drain notifications, one/three-process rolling
replacement, failed readiness, a 20-second forced stop, resource exclusion,
authorization before body reads, schema compatibility and immutable activation.
The isolated Synthetic installation exercises a required-field backfill and a
separate optional-field update under requests to an actual published page. The
compatible scenario also drives the administration upload/apply form in Chrome
at desktop and 390px widths. No business package is registered in the clean CMS.

A real-MongoDB failure/recovery scenario applies the Synthetic required-field
backfill, then fails a unique `(siteId, value)` index on duplicate values. It
verifies that the old runtime remains selected, only completed migration receipts
exist, data and backfilled fields survive, blocked add-on writes return 503, and
fresh paused workers bootstrap while published pages still return 200. A higher
corrected candidate preserves completed receipts and successfully creates a
non-unique index; existing records, new writes and prior update status are checked.

Serving and administrative workers are operating-system processes created with
Node.js `child_process.fork()`, not Worker Threads. They have independent PIDs,
heaps and event loops; installed add-ons share these workers with the CMS. There
is no dedicated process allocation per add-on. Settings / General reports coordinator, administrative, site and temporary dump
processes with PIDs/states, including starting and retiring replacements.

After asynchronous authentication/routing, request admission first checks that
the request/response is still live. A disconnected or already completed response
must not acquire a process lease: its finish/close event can no longer release
one. Active leases still release exactly once on finish, close or synchronous
proxy setup failure. See the
[shutdown regression audit](../audits/0.15.0-worker-shutdown.md).
