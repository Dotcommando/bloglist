# Concepts and execution

## Request execution and the page-cache warning

A Request Snippet is intended to run separately for each page request. Unlike Build,
its result is not meant to become a shared frozen page value. The current whole-page
cache can skip it on a cache hit; background refresh is not a replacement for
execution per visitor request. This can break time-sensitive/current-data behavior.
A working browser form only proves its separate API calls, not server Snippet execution.

Before enabling page caching, check that no Request Snippets are reachable through
the page's bindings, nested chunks, Each targets or conditional branches. Leave the
cache off if any are present. This is currently a manual authoring check. The
[accepted future guard](../../adr/0087-request-snippets-and-page-cache-guard.md)
requires an editor warning and matching backend/publication validation; it is not
implemented yet. SharedPublic/ParallelRead metadata does not waive that requirement.

## Current cache implementation

Request-page server caching is explicitly configurable in the page editor. The
initial TTL is 60 seconds (1–3600 seconds). Save draft preserves the active release;
publish applies the policy. Every reachable Request Snippet must separately allow
public caching and declare an acceptable data age no smaller than the page TTL.
Edited fallback code calls `context.cache.bypass()`. HTTP still uses `no-store`.
See the [cache contract](../../arch/request-document-cache.md).

[Guide](README.md) · [Recipes](recipes.md)

A Page is content identity, a URL is an independent routing object, and a release
is an immutable published routing/document set. Templates own document skeletons;
chunks own reusable fragments. TVs define typed page values and prepared media
references. Snippets prepare typed data before markup composition. Add-ons own
their business objects and may register named API operations. Hooks own checks
and durable reactions. See [rendering](../../arch/rendering-and-publication.md),
[TVs](../../arch/template-variables.md), [add-ons](../../arch/site-addons-contracts.md)
and [hooks](../../arch/hooks.md).

The API is scoped by trusted site identity. siteId/actorId and cancellation are host-owned. Template/chunk/Snippet kind
is selected by its API group; business kind selectors for hooks/URLs remain inputs. Page/URL/file references
still undergo the owning use case's ownership checks. sites.get and sites.list
describe the current site; sites.resolve does not reveal another site. sites.create
is the explicit existing creation operation. Administration users are global
installation objects; creation uses authenticated Settings / Access / Create user or the
console script, not a new cms.adminUsers method. There is no new
RBAC or per-extension grant-management system.

Results are detached readonly data. Entities have no mutable save method.
Instants are ISO UTC strings; date-only strings remain calendar dates.
Big integer business values/IDs are lossless decimal strings where applicable.
Binary content uses an array of integer bytes with its declared byteSize/mimeType.
Omitted object fields remain absent, null remains null, and explicit false/zero
are not replaced by defaults.

Build and Request are independent of Static/Request HTML delivery and None/Api
browser interaction:

- Build runs while building or previewing a page, and freezes the returned value
  in the resulting artifact. Repeated, failed and preview builds are executions too.
- Request is the per-page-request phase, using the selected frozen code/plan and
  prebuilt assets. Current CMS/CDN whole-document cache hits skip execution; see
  the warning above. Disable such reuse when per-request execution is required.
- Static HTML may contain browser API widgets. This does not turn server Snippets
  into independently fetched fragments or expose the server cms client to browsers.

Queries and commands are allowed in Build, Request and preview. Preview is not a
write sandbox. Always await commands. No generic exactly-once behavior or rollback
around rendering/publication is provided. A completed command survives later
Snippet validation errors, rendering failures or failed publication. A deadline,
aborted request or lost result can leave an uncertain command outcome; reconcile
through the operation's business identity/version before retrying. Idempotency
belongs to each command contract.

Reading current data during Build does not automatically rebuild deployed pages.
Data/list membership dependencies need explicit rebuilds. The existing
snippets.update operation can republish its affected already-published pages after
a complete successful source save; this is its existing workflow, not generic
data dependency tracking. Published Request code stays frozen in private plans.

Edited Snippets run through a bounded Worker pool in Build, Request
and preview. Every call receives a fresh isolated realm; ordering and command
semantics are preserved. Operators configure capacity, queue wait and deadlines:
[pool limits and lifecycle](../../arch/snippet-worker-pool.md). The pool does not
enable document caching. Independently, explicitly declared `ParallelRead`
Snippets can run concurrently within render/process limits, including safe chunk
and Each scopes. Their CMS client rejects commands. Unclassified calls remain
ordering barriers. See
[parallel execution](../../arch/parallel-snippet-execution.md).

Composite add-on/CMS operations belong to an owning application operation through
explicit ports. Sequential calls are not an atomic transaction. A provider must
declare atomicity and recovery before offering a composite command; database
sessions never enter cms contracts. Hooks retain their separate existing grants,
delivery ordering and retry policy. They are not silently changed into this API's
permission model.
