# Existing boundaries and selected contracts

- Installation: [ADR 0058](../../../adr/0058-installation-admin-address.md),
  current [authentication](../../../arch/admin-authentication.md). Global singleton,
  safe settings, authentication before reads and after probing, origin CAS,
  no credentials/private DNS/redirects during probe; DB faults fail closed.
- JSON-LD: [Markdown/JSON-LD](../../../arch/markdown-and-json-ld.md). Owned catalog,
  explicit graph values/identities, safe script serialization, frozen release data,
  authorized read-only inspection and no remote identifier fetch.
- Media: [Site Files](../../../arch/site-files.md), [streamed I/O](../../../arch/streamed-file-io.md).
  Auth/site ownership, actual content limits, private immutable originals,
  named projections, guarded pending journal and explicit idempotent reconciliation.
- Publication: [rendering/publication](../../../arch/rendering-and-publication.md),
  [delivery/restore](../../../arch/public-delivery-and-page-restore-contracts.md).
  Active-pointer CAS/receipts, immutable releases, frozen Request plans and drafts
  never silently becoming public.
- Relevant prior QA records: [shared artifact roots](../../../defects/qa/implicit-shared-artifact-storage.md),
  [system-document assumptions](../../../defects/qa/system-document-fixture-assumptions.md),
  [artifact directory](../../../defects/qa/publication-artifact-directory.md),
  [resolved metadata](../../../defects/qa/resolved-document-metadata-expectations.md),
  [unobserved request siblings](../../../defects/qa/unobserved-parallel-http-requests.md).
  Preserve their fixes and use private fixture roots. Runtime/composition routes
  were expanded only where the reviewed boundary crossed them.

Inventory: 38 use cases (installation 2, JSON-LD 5, media 16, publication 15).
Baseline selected application tests: 41 files/120 passed. Completed operation and
adapter mappings, security assessment and limits are in the
[bounded audit](../../../audits/0.15.2-installation-jsonld-media-publication.md).
Actual final commands/results are in [verification](50-verification.md); application
units alone were not treated as proof of storage or HTTP composition.
