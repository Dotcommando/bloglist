# ADR 0041: Private complete site dumps

Date: 2026-10-29

Status: Accepted through the owner's request and scope clarification.

## Decision

Add CreateSiteDump, ListSiteDumps, GetSiteDump, ImportSiteDump and RestoreSiteDump
to authenticated administration and trusted local composition. Settings has
General and Dumps tabs. Existing settings remain under General.

A dump is one versioned `.jsonl.gz` file containing the selected site's database
records, sources, public/private media and retained publication files. Restore
replaces that same site's state while preserving identities and publications.
Other sites, global accounts/sessions, deployment credentials and installed
application/add-on package code are outside the snapshot. The target must contain
the existing site identity and compatible installed schemas and code.

The catalogue is the private filesystem directory, without database dump entities
or a persisted index. Each scan returns regular completed archives. Removed files
disappear quietly; temporary files and links are excluded. Filenames retain UTC
creation instants, including after import.

The snapshot adapter has a narrow technical responsibility to copy the `sites`
record and collections whose installed validator requires `siteId`. Every query
and replacement is scoped to the trusted identity. This technical boundary may
copy site-owned add-on data; ordinary capabilities retain repository ownership.
BSON preserves dates, binary and exact numeric representations. Restore requires
the same collection/validator/index signature and does not install migrations.

Database sources take precedence over file copies. Capture and recovery adopt
file-only JSON/legacy sources into snapshot database records and regenerate private
JSON copies. Keys and versions remain stable. Imported server configuration must
be literal data, preventing arbitrary server-code execution from an upload.

Creation and restoration drain ordinary HTTP requests and temporarily reject new
work. A filesystem lock serializes dump mutations. The current implementation
supports the existing single HTTP writer: independent local commands, another
writer process, background mutations and external file edits must be quiescent.
Distributed maintenance coordination is outside this decision.

Validate and stage before replacement. Capture the previous database state,
replace database records transactionally, and swap staged directories behind the
HTTP gate. A private filesystem journal retains rollback directories. Known aborts
restore files; uncertain commits are reconciled against scoped database
fingerprints. Unresolved outcomes close HTTP. Bootstrap reconciles interrupted
restoration before listening or fails closed, retaining the journal.

See [the contracts](../arch/site-dumps.md).
