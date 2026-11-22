# Design and failure ownership

Trace trusted actor/site identity, ports, real adapter effects and the consumer's
result/status. Preserve current contracts; no speculative abstraction or authority
fallback. Match unit guarantees with real integration evidence before completion.

Confirmed installation finding: key-store failure inside the
reachability probe is caught as address Validation. A user cannot repair unavailable
installation storage by changing an otherwise valid hostname. The key is a required
local dependency, not remote proof failure; its error must retain the technical
failure route, with no network work or settings mutation. Expected DNS/TLS/HTTP/proof
rejections retain the established Validation outcome and unchanged settings. No
automatic settings change or blind retry is introduced.

## Media reconciliation version fence

Confirmed with real MongoDB and files: reconciler B reads pending v1, pauses before
installation; A finishes v1, then v2 commits/installs/acknowledges; B resumes and
replaces v2 files with v1 while MongoDB truthfully still says v2/pending=false.
The writer lock serialized file operations but did not fence a previously read
catalog. Increasing retries or catch-only notification cannot correct this.

The projection port accepts a neutral current-version check, executed while
holding its existing site writer lock, and return whether it installed output.
The store reloads the matching pending journal there. A superseded/already
completed journal causes a no-op, without old cleanup or acknowledgement. Storage
or check failure propagates and preserves the journal. No filesystem/ODM types
cross the port and no new user action or automatic image processing is added.

## Staging failure owns its lock

Actual stage-directory creation failure could leave an open empty writer.lock
because it happened before try/finally. Allocate/check the unique stage path
before acquiring that handle, then create the directory within its lifetime.
Always attempt bounded stage removal, close the handle and remove the lock;
observe every failure, preserve one original error or aggregate multiple causes.
The existing pending journal stays retryable without requiring a person to remove
an empty lock owned by this failed operation. Image processing is never replayed.
