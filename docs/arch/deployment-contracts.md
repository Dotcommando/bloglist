# Deployment contracts for CMS 0.9.0

These contracts refine [ADR 0055](../adr/0055-provider-independent-deployment-and-installation.md).
Accepted by the owner on 2026-11-02. These are the application contracts for
the implemented deployment capability; they do not acknowledge an external deployment.

## Administrative operations

All administrative inputs contain a trusted actor and site identity. Authenticate
before reading request bodies, then require administrator access to the site.
Return Forbidden for unauthorized actors, NotFound for an absent site or target,
InvalidInput for invalid fields and StaleWrite for a changed expected version.
Never return installation secrets, environment values or raw provider responses.

ConfigureDeploymentTarget accepts siteId, actorId, expectedVersion (null on first
configuration), enabled, providerKey, destinationName, publicOrigin and
backendOrigin. It returns the saved target and its new opaque version. Initially
one target is configured per site. The provider registry validates supported
settings; Cloudflare is the initial implementation. The public origin must match
the selected site serving origin. Credentials remain executor configuration,
not an administrative request field or portable site content.

GetDeploymentStatus accepts siteId and actorId. It returns the configured target
or null, current active publication identity, latest delivery state/attempt count,
last confirmed delivered publication and completion instant, and a safe diagnostic.
Expose configuration and delivery versions for guarded administrative actions.

RetryDeployment accepts siteId, actorId and expected delivery version. It queues
the current publication after a known failure, returning updated status. It
rejects a disabled target or an already running attempt. An unresolved external
effect requires reconciliation rather than blindly starting another upload.

CheckDeploymentTarget accepts siteId and actorId. It returns bounded, typed
diagnostics for the saved configuration, publication, storage and backend.
Credential/provider checks run in the executor composition; the HTTP process
does not receive provider secrets or unrestricted network/shell execution.

The site Settings / Deployment tab invokes the authenticated REST boundary:
`GET /api/admin/sites/:siteId/deployment` reads status, `POST` to the same path
saves configuration, and `POST /retry` and `POST /check` invoke recovery and
diagnostics. Configure guards the target version; retry guards the delivery
version. The check body is an empty object. All responses are `no-store`.
The session supplies actor identity; bodies cannot override actor/site identity
or provide credentials. Authentication precedes any body read.

Diagnostics validate the saved provider configuration, read and verify the active
publication through the publication port, and make a bounded HEAD request to the
saved backend's `/api/health` without following redirects. This remains independent
of the installation's configurable administration address. The outbound inspection
port returns only typed diagnostics; it neither queues delivery nor accesses
provider credentials. The executor checks provider authorization/domain ownership
before delivery. Executor backend readiness also uses HEAD `/api/health`, without
depending on the configurable administration path. The CLI additionally supports
`deployment check`.

## Executor operation

ProcessDeploymentTargets runs only in the explicitly configured trusted executor
composition, with no public endpoint. It observes committed publication
activations through an owning capability's explicit port, including routing-only
releases. Per-target durable state records demand independently of process memory.
Draft saves do not request delivery. Configuring/enabling a target also considers
the site's current publication, so first delivery needs no artificial republish.

One attempt owns a target at a time. A newer activation during execution remains
pending, and a later attempt prepares the current publication. Success records
the exact prepared release, not a newly read active pointer. Configuration changes
use version guards and cannot redirect an in-flight attempt to another site or
destination. Disabled targets do not start new attempts.

The provider port separates validation, delivery and reconciliation. Known
temporary failures retry with bounded backoff. Authentication/configuration
failures remain visible for correction. Unknown upload outcomes or ownership lost
during execution become OutcomeUnknown and block another upload until reconciled;
never assert success or permit competing uploads by merely expiring a lease.
Restart recovery retains pending work and reconciles interrupted attempts.

The status model distinguishes Idle, Queued, Running, Succeeded, Failed and
OutcomeUnknown. A public-site delivery is not acknowledged from preparation,
asset upload alone, an unverified process exit or incomplete domain attachment.
No distributed atomic switch with live backend data is promised.

## Safe diagnostics in CMS 0.9.2

IDeploymentDiagnostic retains issue and retryable and optionally carries stage,
reason, httpStatus and recovery. Optional fields preserve legacy records.
Stages are Upload, ProviderVerification, DomainVerification and PublicVerification.
Reasons are UnconfirmedOutcome, HttpStatus, ReceiptMismatch, ActiveVersionMismatch,
DomainMismatch, Network and Authorization. HTTP status is an integer from 100 to
599. Recovery is Reconcile, CheckProviderAndReconcile, CheckDomainAndReconcile,
CheckBackendAndReconcile or CheckCredentialsAndReconcile. No free-form provider
response or exception text is accepted by the persistence or administration boundary.

An Unknown provider outcome may include this diagnostic. The executor persists
it instead of replacing it with Interrupted, and refreshes it after an unresolved
reconciliation without starting another upload. A diagnostic change does not
acknowledge delivery or unlock retries. Legacy interruption without details keeps
the existing generic diagnostic until reconciliation can provide a better one.

The Cloudflare public probe uses HEAD, no-store and no added query parameters.
It still requires the exact attempt/publication receipt, active provider version
and correct domain attachment. Public HTTP 400 records PublicVerification,
HttpStatus, status 400 and CheckBackendAndReconcile while retaining OutcomeUnknown.
A subsequent successful reconciliation confirms the same attempt without upload.

## Persistence and installation boundary

Deployment destination settings and runtime receipts belong to the installation,
scoped by site and target. They are not exported as portable site content. Preserve
them in installation backups. CMS 0.10.0 coordinates delivery and dump operations through a shared private
dumps/.coordination directory. The executor holds an exclusive operation lock
for the entire provider attempt. An unresolved-delivery marker survives an
unknown outcome and prevents restoration and bootstrap recovery until provider
reconciliation succeeds. A failed state read releases the operation lock while
retaining the marker. This prevents an uncertain external upload from overlapping
restoration; it does not promise an atomic switch with the external provider.

Failure to remove a resolved marker still closes the owned handle and attempts
operation-lock removal, preserving all failures. The retained marker continues
blocking restore; the next executor pass can acquire the lock and finish its
reconciliation once storage recovers, without repeating confirmed uploads.

The application and executor must share the same filesystem directory. The
executor retains read-only access to dump archives and receives a writable bind
mount only for .coordination. Do not delete markers or locks to bypass unknown
provider results. Reconcile through the executor first. Manual delivery and
whole-installation recovery still require stopping writers and resolving uploads.

Add versioned migrations after the existing baseline. Production composition
does not create indexes or alter validators automatically. Direct database access
stays in the persistence adapters owning each capability.
