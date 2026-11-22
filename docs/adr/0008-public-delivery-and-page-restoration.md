# ADR 0008: Public document delivery and restoration into one draft

Date: 2026-10-24

Status: Accepted by the owner for the fourth five operations.

## Decision

Implement RenderPublishedPage, GetPublishedArtifact, ListSites, ListPages and
RestorePageVersion with their accepted
[contracts](../arch/public-delivery-and-page-restore-contracts.md).

A separate public Nest application serves GET/HEAD documents and assets. Its
composition has no trusted local operator, administrative use cases, source
compiler or preview delivery. The local AppModule retains all twenty operations.
Both applications reuse persistence and published-runtime composition.

ResolveSite establishes site identity from the registered HTTP hostname.
Forwarded headers are ignored. ResolvePublishedPath selects one active release;
subsequent reads use that exact release and its activation receipt, including
when a newer release becomes active. Ready-but-never-activated output is private.
The public entry never reads editable pages as a fallback.

RenderPublishedPage decodes a private saved Request plan, revives UTC dates,
checks identity and prebuilt asset membership, normalizes declared request data
and executes public read-only Request loaders. It reuses frozen Build values and
prebuilt CSS/JS. Missing Build values or damaged artifacts fail; incoming requests
never compile TypeScript, split CSS, obfuscate JS or reexecute Build loaders.
Required data failures yield an unavailable response without partial success HTML.

GetPublishedArtifact returns only declared public bytes after path, containment,
size and checksum verification. New assets use /assets/releases/<releaseId>/...
URLs while retaining public/assets/... files on disk. Static exports include
the corresponding rewrite. Legacy /assets/... reads look up matching public
files in that site's activated releases. Previous release files remain available;
page-version pruning does not remove release files. No garbage collection or
rollback command is added.

HTTP owns MIME, GET/HEAD/304/redirect behavior, immutable asset caching, document
revalidation and inline-style CSP hashes. Request documents use no-store. Public
errors contain no stored plans or private diagnostics. API/admin paths remain
reserved and this boundary grants no account or business command permissions.

ListSites returns the complete managed list, including archived sites, with a
separate list permission. ListPages returns the complete owned list with existing
filters and read permission. No hidden pagination or archival editing restriction
is introduced.

RestorePageVersion selects position 1, 2 or 3 from newest to oldest and replaces
the entire editable content and rendering configuration. It preserves page/site
identity, immutable mark, language, cluster, creation/first-publication times and
URLs. It explicitly sets DRAFT and changes neither retained publications nor the
active release. A transaction guards both the captured editable page and selected
retained version; an intervening edit, publication or pruning conflict rolls back
the draft write. It never restores a different version after positions move.

## Consequences

Published sites can now serve static and Request documents over HTTP. Dynamic
public data remains site-owned trusted loader code with schema validation and
deadlines. Accounts, administrative REST, the Svelte UI and custom business
modules remain separate work.

Restoration needs no revision-management subsystem or new draft records. The
existing bounded page-publication collection and transaction support are reused;
this batch requires no schema migration. The five-operation integration boundary
covers real composition, HTTP/browser behavior and publication/restore failures.
