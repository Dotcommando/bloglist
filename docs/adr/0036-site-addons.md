# ADR 0036: Registered add-ons and site-owned connections

Date: 2026-10-28

Status: Accepted through the owner's implementation request and follow-up answers.
The concrete installation in this checkout is superseded by
[ADR 0037](0037-clean-cms-and-site-installations.md); generic lifecycle contracts remain.
This supersedes the earlier proposed in-repository-only delivery model and the
legacy assumption that process configuration alone enables participation for sites.

## Decision

An add-on has a code-owned AddonDefinition and a persisted site-owned SiteAddon
connection. One site can connect one instance of each add-on. Enabling,
configuration and disabling are explicit authorized operations. Disabling closes
public access/new requests and standalone event creation while preserving data
and handling of existing meetings/requests. Add-on deletion is deferred by the
owner; it has no endpoint or UI action.

Develop participation in its own repository and deliver @zarya/participation as
a versioned package. CMS Zarya owns the small @zarya/addon-contracts workspace
package, the site connection capability and host integration adapters/composition.
Installed packages run in the same backend and Svelte admin build. Runtime imports
and symlinks into sibling source trees are prohibited. Versioned local tarballs
with lockfile integrity provide reproducible distribution before a registry is
introduced. This is the concrete second consumer authorizing contract extraction.

Business code keeps layer-first domain/app/ports/adapters/infra organization.
Participation owns scheduling, sessions and requests. Pages remain ordinary Pages
with independent URLs; there is no Game entity, required template or /games prefix.
Controllers translate REST and invoke inbound interfaces. Edited Snippets retain
their read-only constrained execution boundary.

A site connection's captured version is enforced within business transactions,
serializing new reservations against Disable. Disabled connections permit existing
administrative workflows under normal business restrictions. Background rolling
generation skips them. Enable/configure and startup of enabled connections verify
configured runtime prerequisites and package migrations; no fake fallback exists.

Empty events can be removed. Events with any requests are cancelled, preserving
those requests and occupied places. Removed recurring occurrences retain private
scheduling exclusions so regeneration and series edits cannot resurrect them.
Started/past meeting schedules remain protected. Cancellation and historical
organizer decisions retain their existing contracts.

Connection settings are live operational data. They neither publish content nor
rewrite static artifacts. Old widgets receive an unavailable API result after
Disable. Content rollback does not roll back connections or bookings. The package
ships a lazy Svelte management component and public data Snippet/chunks/browser
code; adopting editable site components uses existing rendering operations.
The broader declarative admin-section builder remains a separate proposal.

Core migration 0025 creates site_addons. New add-on migrations live in the package
and use their own checksum-verified owner receipt collection. Historical core
migration files are immutable. The owner explicitly permits disposable local-site
setup without a backward-compatible opt-in/data migration or backups. Sites are
connected explicitly rather than inferred from templates, URLs or secrets.

See [the implemented contracts](../arch/site-addons-contracts.md) for operations,
REST inputs, lifecycle, failure semantics, persistence and focused verification.
No persistent local server is started or restarted by setup; the owner runs it
from the IDE.
