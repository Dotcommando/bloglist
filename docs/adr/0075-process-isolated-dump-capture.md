# ADR 0075: Create dumps in a leased child process

Date: 2026-11-10

Status: Accepted through the owner's CMS 0.12.0 implementation request.

## Decision

Keep CreateSiteDump's authorized site/options and metadata result unchanged.
The existing request remains pending and the editor shows its existing busy
state until completion or failure; there is no new public job catalogue or
numeric progress claim. After a lost response, rescan the ordinary dump list.

The real site-dump storage adapter delegates creation through a capture port to
one child process, without a queue. Snapshot capture, BSON/JSONL preparation,
source/media/publication copying, checksums, archive validation and gzip run
there. Parent and child reuse the existing archive/persistence implementations.
Only metadata and validated job settings cross the private IPC channel; binary
payloads remain streamed through private files. Add-on export metadata is copied
without executable functions; package validation uses the shared implementation.

Before admission, the serving parent drains existing operations and holds the
existing installation-wide operation lock. A private random job identity binds
site, parent PID and child PID. The child validates that lease against its actual
parent and the durable lock before and after capture. It writes only below its
job staging root. Another dump/restore process cannot acquire the operation lock.
External/local writers still must be quiescent under the existing one-HTTP-writer
installation contract; this does not introduce a multi-writer installation.

After the initial drain, public GET/HEAD and administration reads remain admitted.
HTTP writes and the hook mutation worker remain blocked. Snippet CMS clients
created during capture are query-only; a GET cannot use a Snippet command to
mutate the snapshot. Restoration retains its exclusive all-request gate.
Maintenance invalidates/fences document, plan and publication-catalog work.

The child has a 512 MiB JavaScript heap and one MongoDB pool of at most two
connections. One process is admitted, with a 30-minute deadline and no retries.
IPC job metadata is bounded to 2 MiB; archive/file limits are unchanged. Parent
shutdown, cancellation, spawn/IPC failure, timeout and crash reject creation and
terminate/reap the child before staging cleanup. Successful completion requires
matching metadata, exit status zero and an atomic rename of the completed file
into the site's ordinary dump directory. Partial files never become Ready.

Bootstrap checks job leases before normal recovery. It refuses a still-live
parent/child and removes abandoned staging only when the owning processes are
dead. A child cannot start capture until its PID has been persisted by the parent.
An uncertain completed response is reconciled through the existing archive list.
Credentials and private payloads are never logged or put in lease records.
The database URI enters only the private child bootstrap environment, not job
IPC; the child resolves it once before opening its bounded connection pool.
