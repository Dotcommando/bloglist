# ADR 0057: Verifiable CMS releases and actionable delivery diagnostics

Date: 2026-11-03

Status: Accepted through the owner's CMS 0.9.2 release request.

## Decision

Prepare 0.9.2 independently of the deferred 0.10.0 work. Keep site content,
credentials and installation data outside the clean CMS release artifact.
Theme packages, dependency installation and readiness checks are deferred.
This release does not introduce a theme installation workflow.

The root package.json is the CMS version authority. The administration build
uses that version automatically. Its header displays `CMS Zarya v.<version>`;
the selected site's name links to its configured serving origin in a new tab,
with an external-link icon and an accessible indication of the new tab. Legacy
sites without saved origins use HTTPS and their registered primary domain,
matching the existing deployment configuration policy.

Produce a source release artifact from a committed CMS revision. Include a
manifest containing the CMS version, full commit identity and SHA-256 inventory
of the payload. Derive a deterministic payload checksum from that inventory.
Provide a separate archive SHA-256 checksum, avoiding a self-referential archive
hash. Verification works without a Git checkout and rejects changed, missing or
unexpected payload files. The administration exposes the packaged revision and
payload checksum. A development build without a release manifest identifies
that absence explicitly instead of inventing release provenance.

Delivery confirmation must not add undeclared query parameters to a Request
document. Keep no-store probing and verify the exact attempt/publication receipt.
Do not relax document input validation to accommodate a delivery probe.

An uncertain delivery remains OutcomeUnknown and blocks another upload until
reconciliation. Preserve safe typed diagnostics from the provider: operation
stage, technical reason, bounded HTTP status when relevant and a recovery action.
Distinguish upload uncertainty from a completed upload whose public verification
failed. Never expose provider response bodies, credentials or raw exception text.
Reconciliation refreshes that diagnostic even if the outcome remains unknown.
Existing diagnostic records remain readable through an additive migration.

## Verification boundary

Keep focused regressions for Request-home confirmation, font detection/storage,
diagnostic persistence/reconciliation and administration presentation. Verify an
existing installation upgrade with isolated synthetic data before publishing the
release. A local artifact or successful build does not acknowledge external
delivery. Test-host deployment is separately authorized by the owner; retain its
private .env throughout the operation.
