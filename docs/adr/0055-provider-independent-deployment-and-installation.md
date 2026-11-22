# ADR 0055: Provider-independent deployment and reproducible installation

Date: 2026-11-02

Status: Accepted through the owner's deployment review, architecture and
documentation requirements, and explicit release-scheduling choice.
Target: CMS 0.9.0, developed on branch `cloudflare-deployment`.
Implementation contracts are recorded in
[deployment contracts](../arch/deployment-contracts.md). Package versions and
verification determine the release; this ADR alone does not acknowledge delivery.

## Context

The manual export and upload in [ADR 0045](0045-cloudflare-site-deployment.md)
requires an operator command after activating a publication. Initial installation
also requires coordination of the backend, database, storage, provider credentials,
domains and TLS. A successful code/assets upload can leave domain attachment
incomplete. These are separate observable outcomes.

Automatic delivery, durable recovery, administrative status and complete
installation instructions form a new deployment capability rather than a patch
limited to correcting the manual command. Reserve 0.9.0 for this work. Move
the Markdown representations and JSON-LD graph capabilities in
[ADR 0053](0053-markdown-representations-and-editor-preview.md) and
[ADR 0054](0054-json-ld-profiles-and-graph-publication.md) to 0.10.0 without
changing their functional requirements.

## Decision

### Boundaries and providers

Keep Hexagonal Architecture and the existing layer-first backend organization.
Domain and application contracts describe deployment targets, publication
delivery, durable jobs, recovery and outcomes independently of a provider.
Outbound ports define required capabilities; Cloudflare tooling, API payloads,
credentials and provider-specific error translation belong in adapters and
validated composition. The administration invokes inbound application operations.

Implement Cloudflare as the first provider. Permit later providers through the
same responsibility boundaries without adding unused provider implementations.
An execution container is another process composition of this CMS, not a new
business microservice. Do not grant the HTTP application unrestricted shell
execution or Docker host control to start delivery.

Keep installation identities, domains, secrets, business add-ons and site data
outside the clean CMS distribution under
[ADR 0037](0037-clean-cms-and-site-installations.md). Generic runnable examples
belong in the distribution. Agree concrete operation inputs, results, failure
semantics and recovery contracts before implementing them under the repository
workflow. This ADR does not invent those method-level contracts.

### Publication and recovery

Activating a publication requests automatic delivery for the configured target;
draft saves do not. Include routing-only releases. Reuse the committed activation
event boundary in [ADR 0043](0043-cms-hooks-and-durable-handlers.md), with durable
processing rather than a best-effort process callback.

Serialize delivery per target, retain work across restarts, and handle newer
activations during an in-progress upload without allowing older output to
overwrite newer output. Expose queued, running, successful and failed delivery
results and explicit retry through authorized, site-scoped administration.
Provider uncertainty requires reconciliation; preparation or a partial upload
does not acknowledge successful public delivery.

Continue distinguishing CMS activation from delivery to an external host.
Retain existing static/Request rendering and live API semantics; no distributed
atomic switch between backend content and external assets is promised.

### Installation, domains and TLS

Ship a complete Docker example for the HTTP application, authenticated
transaction-capable MongoDB, HTTPS reverse proxy and deployment execution.
Pin toolchains and images, persist database/storage/certificate state, and keep
provider credentials scoped to the execution composition that needs them.

Provide initial configuration and diagnostic checks for site identity, selected
origin, administrative origin, backend connectivity, publication/storage access,
provider authorization, domain conflicts and delivery results. Detect known
installation conflicts before an upload where possible; report any partial
provider effects explicitly.

Document canonical-host selection and all HTTP/HTTPS and apex/www combinations,
including DNS proxying, Custom Domains, redirects with path/query preservation,
and backend certificate validation. Provider-specific settings stay explicit;
do not silently change unrelated DNS records or account-wide configuration.

Use the reverse proxy's established ACME automation, initially Caddy, for
backend certificate issuance and renewal. Preserve its certificate/account
storage and document validation requirements and failure diagnosis. Cloudflare
manages the browser-facing certificates for its managed domains. Do not add
a CMS-owned certificate-renewal bot or couple certificate management to page
publication. Other hosting providers can use their own managed TLS mechanisms.

### Bilingual operator documentation

Use a short root `INSTALLATION.md` as the language selector. Keep equivalent
operator guides in `docs/installation/ru/INSTALLATION.md` and
`docs/installation/en/INSTALLATION.md`, with language-local Cloudflare,
TLS/domain and troubleshooting chapters and reciprocal language links.

Cover first installation, migration of an existing installation, backups and
recovery, provider credentials, first delivery, automatic content updates and
CMS code upgrades. Explain that repository code, CMS drafts, active publication
and externally delivered content are different states. Commands must match
the shipped environment rather than require undocumented private scripts.

## Verification and release boundary

Verify focused use cases and real composition in isolated synthetic environments,
including site/target isolation, retries, restart recovery, overlapping
activations, rejected or uncertain provider outcomes, and preservation of drafts
and the prior delivered output. Cover generated configuration and installation
diagnostics. External deployments remain separately authorized operations.

Keep the applied 0.8.0 schema baseline intact; new persistence requirements use
new versioned migrations under [ADR 0051](0051-cms-080-schema-baseline.md).
This decision changes no package version, database, provider configuration or
live site. Release 0.9.0 and its tag require implemented behavior and completed
relevant verification, not merely merging this decision.

Amendment, 2026-11-02: the owner deferred synchronization of site restoration
with in-flight external delivery to CMS 0.10.0. The 0.9.0 operator procedure must
stop the deployment executor and resolve any uncertain upload before restoration.

Implementation amendment, 2026-11-03: CMS 0.10.0 adds shared-filesystem exclusion
between delivery and dump operations. The executor retains read-only access to
archives and receives write access only to dumps/.coordination. An exclusive lock
covers the whole provider attempt; durable unresolved markers block restoration
and bootstrap recovery until reconciliation. The owner explicitly approved this
narrow production mount and installer-directory change. Manual delivery and
whole-installation recovery still stop writers; no provider/backend atomic switch
is implied. See [deployment contracts](../arch/deployment-contracts.md).
