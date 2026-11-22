# Site editing, archival and retained URL behavior

The last five declared operations follow [ADR 0015](../adr/0015-site-lifecycle-and-retained-url-behavior.md).
Invoke their inbound tokens through the trusted local AppModule. They do not
introduce administrative REST routes; those adapters remain separate work.
Apply the schema baseline with `npm run migrate` before starting a fresh installation.

## UpdateSite

New-site domain/development-address onboarding and the selected serving origin
follow [ADR 0035](../adr/0035-site-onboarding-and-selected-origin.md).
CreateSite accepts optional onboarding with localAddress and Public/Local
originMode; the administration form requires it. primaryDomain names the media
directory even when the selected origin is localhost with a port. ResolveSite
accepts the validated request authority alongside its hostname and resolves only
the selected authority for these sites. Existing sites retain legacy resolution.
Conflicting selected origins fail Conflict, including concurrent database claims.
Invalid addresses fail validation before persistence. Media directory failures
propagate after metadata is saved, without automatic replay.

UpdateSite accepts addresses with expectedAddresses. The captured comparison
includes originMode, and the guarded store saves its derived authority together
with the addresses. A stale choice fails StaleWrite; a foreign owned origin fails
Conflict. Origin selection changes delivery immediately; sitemap changes require
publication. On HTTP startup, the coordinator reads sites from the database and
opens selected Local HTTP origins on loopback, as specified in
[ADR 0090](../adr/0090-local-site-http-listeners.md). Database or local bind failure
cancels startup and closes its listeners. Creating a site or changing its local
port requires an HTTP restart to open the new socket. Public, HTTPS and remote
origins require external routing; the CMS does not configure DNS or TLS.

Input: siteId plus optional name, primaryDomain, addLanguages, removeLanguages,
defaultLanguage. Result: acknowledged saved Site. Missing site fails NotFound;
foreign returned identity fails Scope; duplicate normalized domain fails Conflict.
Apply additions, default replacement and removals in that order on a detached
copy. Domain rules preserve a valid enabled default. Identity/mark are immutable.
Replacing the domain changes trusted hostname resolution; no alias, redirect,
DNS update, automatic page translation or URL-domain migration is created.

Removing a language used by any existing page fails Conflict, including draft,
published and archived pages. A site-owned transaction guard serializes edits
with page creation. The transaction checks the captured site and page usage
before saving. The page-owned usage adapter checks all statuses through an
explicit port; composition binds it to the same transaction. Creation acquires
the same guard and rechecks enabled language before inserting the page. A race
cannot leave a page in a disabled language. Concurrent changes may fail Conflict
or StaleWrite rather than silently overwrite settings; no automatic retry.

## ArchiveSite and ArchivePage

Inputs remain siteId, and siteId/pageId respectively. Both return the saved entity
and permit already archived state. Site archival uses the same guarded snapshot
commit as site editing. Page archival compares its full captured snapshot in one
atomic update and changes only status/updatedAt. Concurrent edits/publication
fail instead of being overwritten. Page failures use the existing PageNotFound,
PageScope and PageConflict error classes.

Archival retains content, configuration, publication metadata/versions, URL
history, assets and participation records. ResolveSite excludes archived sites;
authorized administrative reads and draft creation remain available. ArchivePage
changes editorial state and does not remove an active release route. URL changes
also remain working data until a separate site release is published. These are
not complete removal/unpublication workflows.

## RebindUrlToPage and RedirectUrl

Both require siteId, trusted actorId, urlId and expectedVersion. Rebind additionally
takes replacementPageId; Redirect takes targetUrlId and 301/308 redirectStatus.
The editor is the configured local operator, never an arbitrary supplied actor.
Results are acknowledged Url entities. Use `URL_BEHAVIOR_STORE.findVersionedUrl`
from the local context to obtain the current version; no new versioned REST read
is introduced in this batch.

Rebinding requires a same-site existing page with no different current PAGE URL.
Redirecting requires an existing same-site target and an acyclic redirect chain;
target publication is not a gate. Existing redirects may be retargeted or rebound.
Every accepted command, including an equal behavior, receives a new version and
records the previous behavior. Preserve urlId, mark, path, segment, parentUrlId,
createdAt and firstPublishedAt; change only behavior and updatedAt.

The application allocates history identity, next version and UTC time through
IUrlBehaviorValuesPort. IUrlBehaviorStorePort compares full captured state and
expected version. The existing Mongoose routing adapter implements this entire
port alongside IUrlRepository. It reuses the site routing write guard and checks
the final redirect/parent graph inside the transaction. This prevents cycles even
when both actors initially observed valid independent targets. The database
enforces site/path/mark and single-current-PAGE uniqueness. History, URL behavior
and version commit together or roll back together. Stale and occupied targets
fail RoutingConflictError; missing and foreign references retain existing routing
error types. Unknown commit outcomes propagate without automatic replay.

The schema baseline creates site_content_guards with a unique site index and permits
an optional private URL version. Existing documents need no destructive rewrite:
a stable `legacy:` digest of their canonical snapshot is used until their first
mutation. All routing mutation paths assign a fresh version, including assignment,
save and address/subtree moves. Version/ODM fields never enter the Url domain
snapshot or published artifacts.
