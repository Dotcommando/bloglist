# Troubleshooting

[Guide](README.md) · [API reference](reference.md)

| Symptom | Explanation and next action |
| --- | --- |
| Request Snippet is stale or skipped | Whole-page caching can bypass its per-request execution. Check CMS/CDN policy, disable whole-page caching and publish the intended change; HTTP no-store alone is insufficient. The automatic absence guard is planned, not implemented. |
| /api/cms returns 404/405 | cms is a private server client, not a new REST endpoint. Use a Snippet or the add-on host. |
| Validation for siteId/actorId/signal | Remove host-owned fields from arguments. The client supplies kind only for templates/chunks/snippets; other groups retain their business contracts. |
| Unknown filter/sort | Use the documented field allowlist and asc/desc. MongoDB operators and arbitrary paths are unsupported. |
| Pagination null fails | Omit a parameter to use its default. null is a value, not absence. |
| getDraft fails for a foreign page | Owning operations preserve site isolation. Do not substitute another site's data. |
| getPublished returns null | Check the selected page/release, routing membership or retained version. First publication may have no active release. |
| Updated draft is not public | Use the explicit publication operation. Build data and list membership changes need rebuilding. |
| Preview changed data | Commands are enabled in preview by the accepted policy. Reconcile the operation rather than expecting renderer rollback. |
| Conflict/StaleWrite | Reread the owning entity and its captured guards. Do not overwrite another editor's version. |
| AddonDisabled/AddonUnavailable | Check current site connection, installed fixed artifact, SDK compatibility and owned migrations. A previously obtained client is rechecked. |
| Required Snippet failure | Inspect typed inputs/output, declared phase, business errors and worker deadline/output limits. Internal worker details are not public. |
| File API unavailable | Configure the filesystem media adapter explicitly; there is no fake or implicit storage fallback. |
| File values fail in a worker | Binary byte arrays expand encoded data; the worker still has its independent memory/output budget. Do not equate API limit with bytes. |
| Uncertain command outcome | Read by business identity/version and use the command's own idempotency/recovery contract. A worker timeout does not cancel an in-flight database write. |
| Slow deep offset/title sorting | Lists currently materialize their owning results and sort/filter in memory. See the actual index/read-path guide; no query-plan benchmark is implied. |

The SDK declarations are portable data only. Runtime packages pin SDK
compatibility exactly; rebuild packages against the selected SDK before upgrading
a site installation. Do not copy sibling source or change the clean CMS registries
to test a business add-on.
