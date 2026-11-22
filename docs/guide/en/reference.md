# Server API reference

[Guide](README.md) · [Indexes](indexes.md)

The following are server calls, not HTTP endpoints. Neither /api/cms nor a browser
global is registered. Existing authenticated administrative REST endpoints retain
their own contracts. Inputs retain each existing operation's fields and failure
semantics, except host-owned siteId/actorId/signal, group-selected element kind and the list envelope below.
Full parameter/result types are in
[SDK cms.ts](../../../packages/addon-contracts/src/cms.ts).
Operation-specific rules remain in [architecture contracts](../../arch/).

| Object | Operations |
| --- | --- |
| sites | create, get, resolve, list, update, archive |
| pages | create, get, getDraft, getPublished, list, listVersions, update, move, archive, configureRendering, publish, restoreVersion, preview, getPublicationOptions, publishCurrent, publishRelease |
| urls | assignInitial, findByPath, change, getHistory, getCatalog, search, changePublished, materialize, rebind, redirect, redirectPublished |
| templates / chunks / snippets | list, get, create, update, preview |
| tvs | list, save, getPage, savePage |
| files | list, createFolder, upload, changeImage, move, usages, delete, reconcile, readContent, getAsset, uploadAsset, processAsset |
| addons | list, get, enable, configure, disable |
| hooks | list, get, create, update, apply, setEnabled, subscribe, reorder, history, retry, skip |
| adminUsers | get, list, update, block, delete |
| publication | publishSite, publishRouting, resolvePath, renderPage, getArtifact, republishSnippetPages |


## Lists

list, listVersions, getHistory and hooks.history return
{items, total, limit, offset}. Catalogue metadata is additionally returned as
metadata: TV version/siteId, file folders/version/pending, or hook handlers.
Nested arrays in other operation results are not silently repaginated.

Defaults apply only to omitted limit/offset/sortby: 50, 0 and an empty sort list.
limit must be a positive safe integer; offset must be a nonnegative safe integer.
No numerical upper limit is imposed. null is not an omitted pagination argument.
sortby is an ordered array of {field, direction: 'asc' | 'desc'}.
Filtering uses scalar equality in filter. Unknown keys, operators, fields and
sort directions reject with Validation before the owning list is invoked.
Filtering precedes sorting, which precedes offset/limit. A stable identity is
appended as the final ascending tie-breaker. Strings use deterministic UTF-16 code-unit
ordering, not the server's locale. Missing fields sort first, then null, then scalars in ascending order.

| List | Filter/sort fields |
| --- | --- |
| pages.list | pageId, parentPageId, pageNumber, sortOrder, mark, title, language, type, status, clusterId, createdAt, updatedAt, publishedAt |
| sites.list | siteId, mark, name, primaryDomain, status, createdAt, updatedAt |
| templates/chunks/snippets.list | key, name, version, createdAt, updatedAt |
| tvs.list | name, caption, kind, required, sortOrder |
| files.list | fileId, folderId, name, mode, mimeType, byteSize |
| addons.list | addonKey, status (from the retained connection) |
| hooks.list | hookKey, kind, provider, registeredAt, available |
| adminUsers.list | adminUserId, email, blocked, createdAt, updatedAt |
| pages.listVersions | pageVersionId |
| urls.getHistory | urlHistoryEntryId, urlId, kind, pageId, redirectTargetUrlId, redirectStatus, createdAt |
| hooks.history | deliveryId, state, attempts |

pages.list additionally accepts parentId, including null for root pages; this
filters parentPageId rather than URL hierarchy. adminUsers.list retains its status
selector (All/Active/Blocked). Hook history remains the existing latest-200
business history; a larger API limit does not invent older retained records.
Results are materialized before pagination. See the index guide for actual costs.

## Content selection and publication

pages.get is the existing draft read; getDraft is its explicit alias.
getPublished({pageId}) resolves the active release once for that call.
getPublished({pageId, releaseId}) selects that immutable ready release.
getPublished({pageId, pageVersionId}) reads a specific retained page publication.
Combining releaseId and pageVersionId is Validation. Missing/pruned selections
return null. Published reads never substitute the current draft. Existing foreign-page draft reads retain their Scope failure.

listVersions supplies opaque stable pageVersionId values. Retention stays at
three publications. restoreVersion keeps its existing positional selector
(1 latest, 2 previous, 3 oldest), atomic guards and draft-only effect.
The API does not restore pruned versions or extend retention.

publish stores page content; publishRelease/publishCurrent activate page releases.
publication.publishSite is a separate full-site workflow with its existing
expectedActiveReleaseId guard. Route-only workflows preserve published content.
New releases contain complete private page snapshots. They are neither public
assets nor a new retention store for unlimited versions.

## Commands and errors

Use expectedVersion and other captured guards wherever the corresponding operation
requires them. Equal checked input can be a guarded no-op. Stale values, ownership
mismatches, conflicts and the last-administrator rule retain owning behavior.
There is no add-on deletion or console account creation through cms.

Domain BusinessError codes are preserved. Invalid API lists/identity injection
produce Validation. In a worker, business errors have code/message; unexpected
internal errors become an Unavailable error without technical details.
A required Snippet still uses the existing sanitized rendering-failure boundary.
Neither errors nor optional rendering fallback undo a committed command.

Media storage must be explicitly configured for file operations. Binary content
uses {byteSize, mimeType, bytes: number[]}; byte values must be integers 0..255.
TV expectedUpdatedAt uses the exact returned ISO timestamp. Unconfigured storage,
invalid bytes, unavailable add-on code, disabled operations and corrupt snapshots
fail explicitly. Worker deadlines and output budgets still apply independently of
pagination counts; see [transport limits](../../arch/transport-limits.md).

### Add-on administration appearance

See [administration and browser code](../../addon-development/code-standards.md#administration-and-browser-code)
when building an add-on screen.
