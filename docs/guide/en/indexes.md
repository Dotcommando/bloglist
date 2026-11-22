# Indexes and read costs

[Guide](README.md) · [API reference](reference.md)

This catalogue follows migrations/0000-schema-migrations.json and the adapter
queries used by the API.
Every collection also has MongoDB's unique _id_ index; collections without an
additional index use that implicit index. Field order below is significant:
(1) means ascending and (-1) descending. Conditions, collation and TTL options
are reproduced rather than inferred.

Sites, administration accounts, installation registration and authentication
records and addon_installations package metadata are global objects.
Ordinary page/routing/media/element/add-on connection/TV records
are site-owned. Hook runtime records explicitly distinguish site and installation
scope through their installation/scope/generation keys. A global index or opaque
_id does not grant cross-site access; owning operations enforce the trusted site.

| Collection | Index | Ordered fields | Unique | Conditions/options |
| --- | --- | --- | --- | --- |
| sites | sites_mark_unique | markKey(1) | Yes | — |
| sites | sites_domain_unique | primaryDomain(1) | Yes | — |
| sites | sites_serving_authority_unique | servingAuthority(1) | Yes | {"partialFilterExpression":{"servingAuthority":{"$type":"string"}}} |
| pages | pages_site_mark_unique | siteId(1), markKey(1) | Yes | — |
| pages | pages_site_identity | siteId(1), _id(1) | No | — |
| pages | pages_cluster_identity | clusterId(1), _id(1) | No | — |
| pages | pages_site_number_unique | siteId(1), pageNumber(1) | Yes | {"partialFilterExpression":{"pageNumber":{"$type":"string"}}} |
| pages | pages_site_parent_order | siteId(1), parentPageId(1), sortOrder(1) | No | — |
| urls | urls_mark_unique | markKey(1) | Yes | — |
| urls | urls_site_path_unique | siteId(1), path(1) | Yes | — |
| urls | urls_current_page_unique | siteId(1), pageId(1) | Yes | {"partialFilterExpression":{"kind":"PAGE"}} |
| urls | urls_parent_identity | siteId(1), parentUrlId(1), _id(1) | No | — |
| urls | urls_site_kind_path | siteId(1), kind(1), path(1) | No | — |
| url_history | url_history_order | siteId(1), urlId(1), createdAt(1), _id(1) | No | — |
| page_publications | page_publications_site_identity | _id(1), siteId(1) | No | — |
| publication_releases | publication_releases_site_identity | siteId(1), _id(1) | No | — |
| publication_activations | publication_activations_site_identity | siteId(1), _id(1) | No | — |
| assets | assets_owned_version_unique | siteId(1), assetId(1), _id(1) | Yes | — |
| admin_users | admin_users_live_email_unique | email(1) | Yes | {"partialFilterExpression":{"deletedAt":null},"collation":{"locale":"en","strength":2}} |
| admin_users | admin_users_live_created | deletedAt(1), createdAt(1), _id(1) | No | — |
| admin_users | admin_users_active | deletedAt(1), blocked(1) | No | — |
| admin_auth_sessions | admin_auth_token_unique | tokenDigest(1) | Yes | — |
| admin_auth_sessions | admin_auth_owner_created | adminUserId(1), accountVersion(1), revokedAt(1), createdAt(1), _id(1) | No | — |
| admin_auth_sessions | admin_auth_expiry | expiresAt(1) | No | {"expireAfterSeconds":0} |
| admin_login_attempts | admin_login_attempt_expiry | expiresAt(1) | No | {"expireAfterSeconds":0} |
| site_content_guards | site_content_guard_site_unique | siteId(1) | Yes | — |
| rendering_elements | rendering_elements_site_kind_key_unique | siteId(1), kind(1), key(1) | Yes | — |
| rendering_element_sequences | rendering_element_sequences_site_kind_unique | siteId(1), kind(1) | Yes | — |
| page_sequences | page_sequences_site_unique | siteId(1) | Yes | — |
| media_libraries | media_libraries_site_unique | siteId(1) | Yes | — |
| addon_installations | addon_installations_repository_unique | repositoryUrl(1) | Yes | — |
| addon_installations | addon_installations_key_unique | addonKey(1) | Yes | — |
| site_addons | site_addons_enabled | status(1), siteId(1) | No | — |
| site_addons | site_addons_site_key_unique | siteId(1), addonKey(1) | Yes | — |
| cms_installations | installation_singleton | singletonKey(1) | Yes | — |
| hook_registrations | hook_registration_identity | hookKey(1), schemaVersion(1) | Yes | — |
| hook_handlers | hook_handlers_site_created | siteId(1), createdAt(1), _id(1) | No | — |
| hook_handler_versions | hook_handler_draft_unique | siteId(1), handlerId(1), sourceDraftVersion(1) | Yes | — |
| hook_handler_versions | hook_handler_version_history | siteId(1), handlerId(1), appliedAt(1), _id(1) | No | — |
| hook_subscriptions | hook_subscription_matching | siteId(1), hookKey(1), schemaVersion(1), enabled(1) | No | — |
| hook_subscriptions | hook_subscription_handler | siteId(1), handlerId(1) | No | — |
| hook_subscriptions | hook_subscription_manifest | siteId(1), addonKey(1), manifestKey(1) | Yes | {"partialFilterExpression":{"ownerKind":"Addon"}} |
| hook_scope_states | hook_scope_identity | installationId(1), scopeKey(1) | Yes | — |
| hook_events | hook_event_sequence | installationId(1), scopeKey(1), generation(1), sequence(1) | Yes | — |
| hook_events | hook_event_fact | installationId(1), scopeKey(1), generation(1), operationId(1), factKey(1) | Yes | — |
| hook_events | hook_event_dispatch | installationId(1), scopeKey(1), generation(1), dispatchState(1), sequence(1) | No | — |
| hook_events | hook_event_history | siteId(1), occurredAt(-1), _id(-1) | No | — |
| hook_event_details | hook_event_detail_order | installationId(1), scopeKey(1), generation(1), eventId(1), ordinal(1) | Yes | — |
| hook_execution_chains | hook_chain_root | installationId(1), scopeKey(1), generation(1), rootOperationId(1) | Yes | — |
| hook_delivery_lanes | hook_lane_identity | installationId(1), scopeKey(1), generation(1), consumerId(1), subject(1) | Yes | — |
| hook_deliveries | hook_delivery_unique | installationId(1), scopeKey(1), generation(1), eventId(1), subscriberId(1), unitKey(1) | Yes | — |
| hook_deliveries | hook_delivery_lane_position | laneId(1), laneSequence(1) | Yes | — |
| hook_deliveries | hook_delivery_due | state(1), nextAttemptAt(1), _id(1) | No | — |
| hook_deliveries | hook_delivery_history | siteId(1), createdAt(-1), _id(-1) | No | — |
| hook_executions | hook_execution_attempt | deliveryId(1), attemptNumber(1) | Yes | {"partialFilterExpression":{"kind":"Event"}} |
| hook_executions | hook_execution_history | siteId(1), startedAt(-1), _id(-1) | No | — |
| hook_command_executions | hook_command_plan_key | deliveryId(1), commandKey(1) | Yes | — |
| hook_command_executions | hook_command_idempotency | installationId(1), scopeKey(1), idempotencyKey(1) | Yes | — |
| template_variables | template_variables_site_unique | siteId(1) | Yes | — |


## Match the actual read path

| API family | Actual read and useful query shape |
| --- | --- |
| sites | get uses the site identity; resolve uses normalized domain/serving authority. The unique domain indexes support exact resolution. The scoped list describes only the current site. |
| pages | get/getDraft use page identity and verify site ownership. list reads the site's working pages through the existing list port, then API filters/sorts in memory. list({filter:{language:'en'}}) and title sorting do not become indexed server queries merely because those API fields exist. |
| urls | findByPath({path:'/example/'}) uses the exact site/path key. getHistory({urlId}) uses the site/url/createdAt/_id order. getCatalog combines working URLs, page metadata and published release data. search preserves the existing URL-suggestion operation and its own limit contract. |
| templates/chunks/snippets | The database prefix is siteId/kind; the catalogue also merges trusted file sources and built-ins. An absent database entity can use the file fallback, but a database error cannot. Name/alias matching and final API order happen over the merged catalogue. |
| tvs | The catalogue is one guarded site document. API field filtering and sortOrder ordering are over its embedded field array. getPage also reads the draft and prepares media values. save replaces the complete captured catalogue. |
| files | The library is one guarded site document. Its embedded files/folders are projected and then paginated in memory. File-content reads use owned metadata and configured storage, not caller-supplied filesystem paths. Asset versions have their own site/asset identity index. |
| addons | The catalogue unions code registrations and retained site connections. The unique site/key index supports connection lookup; connection status and final list sorting are evaluated on the merged result. |
| hooks | Registrations, site handlers and bindings are composed into a tree. history reads the existing latest-200 site window by createdAt/_id before API pagination. Hook lane, command receipt and generation indexes protect execution guarantees, not arbitrary API sorting. |
| adminUsers | The existing cursor operation reads complete pages of at most 100 and the API gathers all matching profiles before offset/sort. The non-deleted createdAt/_id path and active status index are relevant to source queries; email uniqueness uses its documented case-insensitive collation. Final email sorting is in memory. |
| pages.getPublished | The active release is selected once per call, or an explicit ready release is read. Checksummed private page artifacts supply content, not the current pages collection. The present release/artifact reader verifies the release and materializes its artifact set; a MongoDB index does not accelerate those filesystem reads. |
| pages.listVersions | The owning page-publication document supplies at most three retained snapshots. Opaque version IDs are derived from canonical content. This is neither a full revision collection nor a release-artifact search. |
| publication | Routing resolution uses one selected activation and its immutable manifest; Request rendering uses private saved plans and prebuilt assets. Those paths do not rerun a MongoDB page-list query or a frontend build automatically. |

Prefer exact identity/path operations when only one object is needed.
API lists currently materialize their owning result before filtering, sorting
and offset slicing. Matching a persistence prefix can help fetch the source set,
but it does not accelerate a subsequent in-memory sort. Deep offsets can remain
expensive even with a matching source index. Separate calls are not a shared
transactional snapshot, and concurrent changes can alter membership/counts.

These are descriptions and reasoned cost guidance, not measured query plans,
benchmarks or latency guarantees. No new database index is introduced by this API.
