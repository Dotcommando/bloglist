# Authorization verification cases

| ID | Expected result | Verification boundary |
| --- | --- | --- |
| RBAC-M1 | Fresh and existing installations have the three immutable built-in role identities and all eight authorization collections with strict validators. | Migration manifest unit check and `test/integration/rbac-migration.integration.spec.ts` against isolated MongoDB. |
| RBAC-M2 | Legacy active and blocked accounts receive an explicit SystemAdmin assignment; deleted accounts receive none. Retrying a completed migration preserves assignments and receipts. | Same MongoDB integration test, with records created before migration. |
| RBAC-M3 | Runtime add-on migrations cannot invoke the CMS authorization transform. | Migration engine boundary test. |
| RBAC-M4 | Migration 0015 seeds Global and Site definitions plus their protected action grants. | Isolated MongoDB migration test. |
| RBAC-A1 | A console-created account is SystemAdmin. Scoped account creation and assignment do not elevate authority. Removing or blocking the final active SystemAdmin fails. | Administration use-case and MongoDB account lifecycle checks. |
| RBAC-A2 | A SiteAdmin can act only within the assigned site. Installation and General restrictions hold on direct HTTP, and the site picker filters the directory. | Real dispatcher/session and browser checks. |
| RBAC-A3 | A Manager starts without business grants. An explicit site-wide grant admits the matching action on that site; revocation takes effect on the next request with the same session. | Policy unit and real dispatcher tests. |
| RBAC-A4 | Add-on action metadata is validated and effective only with the selected runtime. Its object authority and site connection both apply. | Manifest validation and legacy public and SystemAdmin admission are covered. Registration and enforcement for declaring runtime packages are pending. |
| RBAC-A5 | Supported page, chunk and snippet actions apply ownership predicates to list, read and write. Current scope is checked inside business writes. | Real HTTP through the guarded MongoDB adapters covers positive and negative object scope, group changes, and revocation while a write is in flight. |
| RBAC-A6 | Custom roles and memberships can be managed without widening installation authority or crossing sites. | Real HTTP and isolated MongoDB cover custom role creation, grant and removal, plus group membership and archiving. |
| RBAC-A7 | System Admin and Site Admin require the corresponding grant even in an existing session. The group editor rejects changes to either built-in group. | Real HTTP and isolated MongoDB cover denial after grant removal, recovery, and read-only membership. |
| RBAC-A8 | Console creation accepts a site identifier, assigns Site Admin only for that site, rejects unknown sites without creating an account, and keeps first SystemAdmin as the setup trigger. | Console adapter, use case and isolated MongoDB CLI tests. |
| RBAC-UI1 | SiteAdmin sees site Main and Access. Installation General is absent. | Headless Edge, `test/integration/admin-users-ui.integration.spec.ts`. |

## Access workspace follow-up

| ID | Boundary and observable scenario |
| --- | --- |
| RBAC-UI-01 | Real browser checks tabs, compact Refresh, alignment, mirrored checkboxes, timed dismissal and Escape. |
| RBAC-UI-02 | A create-only Pages role sees Pages and Add with no page tree or publication requests. A user without Pages permissions sees no Pages entry. |
| RBAC-UI-03 | Manager defaults include the five editorial workspaces and exclude installation, account administration, and whole-site publication. Saving an empty Manager override removes the defaults. Check the real session and site access API. |
| RBAC-UI-04 | Create an account with a custom role on its owning site. Reject a foreign role and reject update or deletion of either built-in administrator role at HTTP admission or the owning operation. |

## Interface recommendation 1. Page positioning

| Case | Observable outcome | Evidence |
| --- | --- | --- |
| ACCESS-01A | A user with read and position but without list can open a page by link, sees a localized hint, and cannot select a parent or drag. The browser requests neither the list nor a move. | Real Playwright and isolated MongoDB |
| ACCESS-01B | A role editor sees the list-scope hint only with position granted and list absent. Checking any list scope clears it. | Same Playwright scenario |
| ACCESS-01C | With list and position, an editor can drag a page to a parent and see the persisted placement after reload. A list-only position viewer sees the tree without drag or demand for more rights. | Same Playwright scenario and existing page-tree regression |

## Interface recommendation 2. Draft editing without publication options

| Case | Observable outcome | Evidence |
| --- | --- | --- |
| ACCESS-02A | Draft read and update can save without fetching page publication options. The editor shows the hint and omits the templates, URL, cache and publish controls. | Real login, Playwright and isolated MongoDB |
| ACCESS-02B | The role hint tracks the selected options grant. The editor displays per-page options when granted. | Same Playwright case |
| ACCESS-02C | Authorized site options display published availability without the settings panel. Independent Markdown and JSON-LD rights work with known and unknown availability. The published result preserves the previously released text after a draft save. Without those rights the controls are absent. | Same Playwright case with a real public release |

## Interface recommendation 3. Publish a saved draft

| Case | Observable outcome | Evidence |
| --- | --- | --- |
| ACCESS-03A | The publisher without draft update sees only publication of the saved draft. The request sends no template, path or draft changes, and the release contains saved content. | Real login, Playwright and MongoDB |
| ACCESS-03B | Missing page options, working URL or required template gives actionable guidance and emits no publication request. | Same Playwright case |
| ACCESS-03C | Losing the acknowledgement of a committed publication produces an uncertain-state hint and stops retry until reload. | Playwright with a single dropped acknowledgement from the real endpoint |

## Interface recommendation 4. Site-wide metadata with restricted page rights

| Case | Observable outcome | Evidence |
| --- | --- | --- |
| ACCESS-04A | Site publication options and URLs still expose their permitted metadata outside Own and Groups. The URL card for an inaccessible page has no link to its draft. | Real Playwright and MongoDB |
| ACCESS-04B | A matching own or group draft has an editor link; following it loads that draft. | Same Playwright case |
| ACCESS-04C | Both broad grants warn on a mixed role with scoped pages, and clearing one broad action removes its warning. | Same Playwright case |

## Interface recommendation 5. Read page TV values

| Case | Observable outcome | Evidence |
| --- | --- | --- |
| ACCESS-05A | Draft editors with TV list/read can view a saved value without page options or TV write. Text input remains read-only and the TV help is visible. | Real Playwright and MongoDB |
| ACCESS-05B | A normal draft edit persists without issuing a TV write or changing the stored TV value. Granting TV save enables a valid edit and persists it. | Same Playwright case |
| ACCESS-05C | A TV list grant without page TV read leaves the TV tab absent. | Same Playwright case |

## Interface recommendation 6. Read JSON-LD profiles

| Case | Observable outcome | Evidence |
| --- | --- | --- |
| ACCESS-06A | A catalog reader can open an assigned profile from a page and a template and reload its direct link. With no save grant the profile has read-only fields and help, and the API denies a write. | Real login, Playwright and MongoDB |
| ACCESS-06B | Adding catalog save makes the profile editable and persists a change. Revoking catalog read removes the assignment panel. | Same Playwright case |

## Interface recommendation 7. Open Graph image access

| Case | Observable outcome | Evidence |
| --- | --- | --- |
| ACCESS-07A | A draft editor without file list sees the saved Open Graph URL and guidance without a library request. Saving another field preserves the URL. | Real Playwright, isolated MongoDB and media store |
| ACCESS-07B | File list enables the chooser and names without private content requests. Adding content read fetches thumbnails. | Same Playwright case |

## Interface recommendation 8. Contextual page output

| Case | Observable outcome | Evidence |
| --- | --- | --- |
| ACCESS-08A | Markdown-only and JSON-LD-only preview grants expose no Pages section or direct editor. The role warns until draft read is granted. | Real Playwright and MongoDB |
| ACCESS-08B | With draft read, both granted preview actions work from an existing page without the tree. JSON-LD catalog stays separate and its settings link needs catalog read. | Same Playwright case |
| ACCESS-09A | A writer can create and update a template, chunk and snippet draft without publication. Drafts persist and no publication is requested or created. The saved status explains who can apply the changes. | Real Playwright and MongoDB |
| ACCESS-09B | Adding site publication alongside source write gives each editor Save & apply, an explanation about site-wide publication and a successful release. | Same Playwright case |
| ACCESS-09C | Saving a Snippet used by an active page preserves the served output with and without site publishing access. A delegated update via API also saves only a draft. Save & apply publishes the saved sources. | Same Playwright case |
| ACCESS-10A | For all three source kinds, missing result read or a readable using page shows guidance. Missing generation leaves the preview controls unavailable. | Real Playwright and MongoDB |
| ACCESS-10B | With scoped page read and both preview grants, each editor offers an eligible owned page and loads compiled iframe content. An out-of-scope page cannot be previewed and loss of page read closes access to earlier documents. | Same Playwright case |
| ACCESS-11A | Usages retain authorized names. A role with Own chunk read can navigate to its own chunk. Another chunk, a template and a page remain plain text, with one access hint. | Real Playwright and MongoDB |
| ACCESS-11B | Adding target read access enables links to the other chunk, template and page. Each editor opens and the hint disappears. | Same Playwright case |
| ACCESS-12A | Upload and folder writers with no list see the relevant mobile guidance. The workspace sends no library requests and the role hints disappear when list access is selected. | Real Playwright and MongoDB |
| ACCESS-12B | With list access, folder creation and file upload in the root use the current version and persist independently. | Same Playwright case |
| ACCESS-13A | Move or delete without reference review leaves file metadata readable with the applicable guidance. Drag, inline rename, organizer and delete are unavailable. No reference or write request occurs, and role hints react to the review grant. | Real Playwright and MongoDB |
| ACCESS-13B | With reference review and the write grants, a real drag shows usages, cancel keeps the file, and force delete is offered only after explicit review of a referenced file. | Same Playwright case |
| ACCESS-14A | An operator sees current and proposed URLs, the effect of updating links and the known references without editor links. Adding a target read grant makes the matching links usable. | Real Playwright and MongoDB |
| ACCESS-14B | The present file move grant updates draft links and the active public address. Unrelated page and Snippet draft edits remain unpublished and retained releases keep their original contents. | Same Playwright case |
| ACCESS-15A | A file list reader sees type icons, metadata and output names. The details explain access, send no byte requests and expose no private links. Direct original and variant requests are denied. | Real Playwright and MongoDB |
| ACCESS-15B | Content read enables a loaded preview, original download with matching bytes and the variant in its browser tab. | Same Playwright case |
| ACCESS-16A | A writer without URL list sees guidance without a tree, editor or catalog request. Adding list shows the saved parent or target without issuing suggestions. | Real Playwright and MongoDB |
| ACCESS-16B | Without search a path save preserves its parent and a redirect status save preserves its destination. With search the operator can open both pickers and save a new destination. | Same Playwright case |
| ACCESS-17 | With URL list alone the linked page retains its catalog name and guidance, without a draft request or link. Direct read is denied. Adding draft read opens the editor. Own and Groups checks continue to restrict individual links. | Extend the real ACCESS-04 Playwright case |
| ACCESS-18A | A writer without routing publish sees successful activation when it occurs. Real 202 responses after move and redirect saves show who can apply the saved changes. | Real Playwright, MongoDB and a one-time injected publication-stage fault |
| ACCESS-18B | Routing publication alone applies both saved changes, sends no repeated edits, and keeps history unchanged. With no active release, applying routes explains the content publication dependency. | Same Playwright case |
| ACCESS-19A | Main Settings read shows saved values and read-only guidance. Both writes are denied. Adding site publication opens Rebuild without making inputs editable. | Real Playwright and MongoDB |
| ACCESS-19B | A settings writer can save without rebuilding. Guidance for refreshing the sitemap appears after a public-origin save. With both write grants, a rebuild creates a release using the saved state and does not submit edited settings. | Same Playwright case |
| ACCESS-20A | Creation alone works from the mobile Hooks workspace without loading the catalog or writing a subscription. The same permission creates only a draft on an accessible hook card. | Real Playwright and MongoDB |
| ACCESS-20B | Subscription access assigns existing drafts independently. Both grants enable the combined action. If its second request fails, the saved draft can be attached separately without making another copy. | Same Playwright case |
| ACCESS-21A | An installed component with multi-domain Action metadata and no screen binding has no site menu item. Site Admin gets a configuration hint and can open the connected component from Add-ons. A delegated catalog reader cannot open the screen by URL or read its manifest/assets. A headless package has no screen hint. | Real Playwright and installed synthetic runtime |
| ACCESS-21B | A registered screen opens when the role has its explicit Actions. Nested screens filter independently. A control explains its missing Action and any command still requires it at the server. | Pending runtime Action registration and UI binding contract |

## Automatic URLs for draft authors

| Case | Observable outcome | Evidence |
| --- | --- | --- |
| URL-DRAFT-01 | A custom role with only page creation can save drafts in several languages. H1 supplies the slug, and active publication does not change. | `test/integration/admin-users-http.integration.spec.ts` |
| URL-DRAFT-02 | A valid real parent contributes its URL prefix. An unassigned or foreign parent cannot leave a partial draft. | Same HTTP integration |
| URL-DRAFT-03 | A manual URL in the body or query is rejected. Direct virtual-folder and manual publication requests are denied. | Same HTTP integration |
| URL-DRAFT-04 | Existing URL paths and implicit virtual folders stay reserved. If a concurrent write claims the approved candidate, the other transaction rolls back and a new attempt chooses a suffix. | Same HTTP integration |
| URL-DRAFT-05 | A site administrator saves overrides, retained URLs stay intact, and foreign, malformed and stale writes fail. | Same HTTP integration |
| URL-DRAFT-06 | All ten languages generate predictable paths. NFC input, punctuation precedence, case and empty/space substitutions are covered. | `test/domain/transliteration.spec.ts` |
| URL-DRAFT-07 | A missing H1 or a routing check denial reaches the caller before persistence. | `test/app/pages/create-page.spec.ts` |
| URL-DRAFT-08 | The author sees mandatory H1 and no manual path field. The tables show localized hints and reflow into one, two or three columns. | `test/integration/admin-users-ui.integration.spec.ts` |
| URL-DRAFT-09 | The URLs catalog remains readable without materialization. The virtual-folder link requires list, page creation and materialization grants, includes the selected address in both languages, and wraps long paths on narrow screens. | Playwright in `test/integration/admin-users-ui.integration.spec.ts` |
| URL-DRAFT-10 | The virtual-folder link opens the editor with the displayed address and supports saving a draft at that address. | Playwright and isolated MongoDB in `test/integration/admin-urls.integration.spec.ts` |

## Site and installation dumps

| Case | Action and actor | Expected |
| --- | --- | --- |
| DUMP-RBAC-01 | Site Admin creates a full dump of the assigned site | 201 and site metadata. Another site and category archives are denied. |
| DUMP-RBAC-02 | Site Admin restores a full dump of the assigned site | Prior state is restored. The other site and Global group remain intact. |
| DUMP-RBAC-03 | Create and download an installation dump as System Admin and Site Admin | System Admin receives metadata and a private archive. Site Admin is denied. |
| DUMP-RBAC-04 | Restore an installation archive | System Admin restores both sites and the files. Denied, incompatible and corrupt requests preserve live state. Active sessions are revoked after success. |
| DUMP-RBAC-05 | Site Admin and Manager access the Global group | Site Admin sees only Site and cannot edit, archive or assign Global. Manager is denied Access. |
| DUMP-POOL-01 | Create both archives from Settings / Dumps in headless Chrome with one serving process | Both requests complete. The same serving PID remains and no capture child appears. |
| DUMP-POOL-02 | Create both archives from Settings / Dumps in headless Chrome with two serving processes | Each request uses a capture child, returns 201 and replaces exactly one serving process. |
| DUMP-UI-01 | Open Settings tabs at desktop and mobile widths | The heading aligns to the Access heading, and Site Admin sees the full-site option with the installation controls hidden. |
