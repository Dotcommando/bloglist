# ADR 0019: Administration routes and publication of one page

Date: 2026-10-26

Status: Accepted by the owner's request and follow-up choices: publish the
current page, offer an explicit basic template and a public URL in the editor.

## Navigation

| Address | Behavior |
| --- | --- |
| `/admin/` or authenticated `/admin/login` | Last available site, otherwise the first available site, or creation when none exists |
| `/admin/sites` | Explicit site selection, independently of the remembered preference |
| `/admin/sites/new` | Site creation |
| `/admin/sites/:siteId` | Site workspace |
| `/admin/sites/:siteId/pages/new` | New page editor |
| `/admin/sites/:siteId/pages/:pageId` | Existing page editor |

Use browser history and support direct visits/reloads through a finite server
shell allowlist, not broad filesystem/SPA fallback. An unauthenticated deep link
resumes after login. Preserve forms during language/panel switches and block
navigation to another resource during a pending mutation.

Remember the selected site in `zarya_admin_site`: host-only, `Path=/admin`,
`SameSite=Strict`, one-year Max-Age, Secure on HTTPS. This frontend-readable
cookie contains only an untrusted preference. Validate it against the current
authenticated site list; ignore duplicate/malformed or unavailable IDs. The
separate authentication cookie remains HttpOnly under `/api/admin`.

## Editor actions and setup

Per the owner's 2026-10-27 update, place page actions in a non-scrolling area
above the editor content, in DOM/keyboard order Cancel, Save draft, Save & publish.
Show save/publication errors immediately below them in the same area. Only
Save & publish is primary. The owner's subsequent 2026-10-27 refinement places
navigation and page actions in one toolbar row from the 768px tablet threshold.
Include full-site publication from the 992px desktop workspace threshold.
Below 576px, use compact 12px labels, 2px/4px button padding and a 32px minimum
button height (up to 36px for wrapped labels), keeping all three in one row.
Reduce mobile toolbar padding as well. Errors remain below this row.
Place the template and public URL fields immediately after the page title.
Cancel exits without saving. Default form submission saves a draft;
publication requires an explicit action. Guard mutations/navigation while pending.
Show a blocking loader over the page workspace during saving/publication and
disable editor actions. On complete success show Draft saved or Page published
for one second, then replace the editor address with the current site workspace.
Keep actions disabled during that acknowledgement. On failure keep the editor
open, remove the loader and preserve input; do not schedule a redirect.

Save draft keeps the existing content contract. Save & publish saves/creates
the draft, applies publication settings and publishes that page. Preserve the
saved page ID and entered values on publication failure so a retry cannot create
a duplicate page. Never show publication success from a draft acknowledgement,
and never automatically replay a timed-out mutation.

Offer registered document templates and explicitly registered ZaryaBasic, which
renders page-language HTML, title and sanitized Markdown without business
integrations/browser JS. It is never a fallback for an invalid selection or
broken source configuration. Register it in local/authenticated composition.
Sites without filesystem sources can select it; their publication key derives
deterministically from trusted site identity. File-configured sites retain their
key. Duplicate template registration fails. New selection of a template needing
required parameters is disabled in this simple editor; existing complete
configuration is preserved when its template is unchanged.

Require a public path for first publication, suggesting `/` for the first page.
Use AssignInitialPageUrl without inferring identity/hierarchy. Existing paths
are read-only here; changes still use ChangePageUrl. Reject reserved `/admin`,
`/api` and `/assets` paths. An explicit template change selects Static/None with
empty parameters/bindings; unchanged selection preserves Static/Request settings.

## Operations and HTTP boundary

GetPublicationOptions accepts an owned site and optional owned page and returns
template descriptors/current template/path. PublishCurrentPage accepts an owned
page, trusted actor and optional template/path; it prepares rendering/address
through existing inbound operations. PublishPageRelease publishes content,
captures the base release, renders/builds one page, stages and activates a new
release. The two publication operations return the published Page and active
publication. Register all three inbound ports in AppModule and authenticated
HTTP composition with real adapters and request-owned session authority.

| REST request | Result |
| --- | --- |
| GET `/api/admin/sites/:siteId/publication` | Site template options |
| GET `/api/admin/sites/:siteId/pages/:pageId/publication` | Owned page options |
| POST `/api/admin/sites/:siteId/pages/:pageId/publication`, optional templateId/path | Publish this saved page; return page and active publication |
| POST `/api/admin/sites/:siteId/publish`, `{}` | Explicit full-site release from retained published versions |

Reuse exact Host/Origin/custom-header/JSON/session protections. Derive actor ID
from the session; reject caller actor/ownership fields. No local-operator
authority enters HTTP composition. Missing/foreign pages return 404, invalid
setup 400, conflicts/stale activation 409, missing sessions 401 and unexpected
failures sanitized 500. Options/errors expose no source code or filesystem paths.

Draft saving, rendering/address preparation, page-version publication and release
activation remain separately acknowledged stages. A later failure does not
claim to roll back earlier stages. Failed builds leave the old release active.
Use the captured active release as the activation concurrency guard and reconcile
lost activation acknowledgements with the existing activation receipt.

## Incremental release outputs

Render/compile only the selected page, including its Build loaders. Retain other
active routes and compiled static documents/assets/frozen Request plans; do not
include unrelated drafts or pending route changes. Reject collisions with retained
paths. The artifact-source port reads checksum-verified public/private output
only from the same site/base release. Stage a complete immutable release before
atomic activation. Incoming public GET never compiles assets.

Static HTML stays byte-for-byte identical with its version-qualified assets.
For retained Request plans preserve page/template snapshots and Build values;
requalify only injected prebuilt asset links to the new selected release, which
contains those same files. Validate plan identity and asset membership, preserve
private visibility and never rerun Build loaders to copy a plan. Regenerate the
standalone redirect export for combined routes and asset aliases.

Incremental releases may retain multiple common CSS/JS generations: unchanged
pages keep compiled dependencies while the selected page uses its new generation.
This explicitly extends the full-site two-common-CSS-file contract. Full-site
publication still computes dependencies across all routes and rebuilds shared
groups; use its separate command to apply shared template/style changes to every
page. Do not overwrite old releases or remove files needed by older HTML or
in-flight requests. External page-only CSS remains forbidden.

No MongoDB schema/index change is needed: existing rendering, URLs, releases,
artifact metadata and activation receipts already support this workflow.
