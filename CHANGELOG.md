# Changelog

[Русская версия](CHANGLOG.ru.md)

## Unreleased

Add a Files breadcrumb to return from a file card to its folder.

Keep media results in place under [the shared loading overlay](docs/defects/admin/media-browser-refresh-shift.md)
and use compact controls in the Files toolbar.

Center [the media browser pager and its status](docs/defects/admin/media-browser-control-alignment.md),
group the header controls and move the page size to Settings / General.
Explain the existing permission boundary for category dumps.

Use [separate responsive installation archive cards](docs/defects/admin/installation-dump-form-layout.md)
and the shared CMS file chooser.

Store Files metadata and recovery journals as individual records. Apply named
output changes incrementally. Share the paginated folder browser between Files,
the image selector and the add-on file picker. SDK 0.7.0 adds scoped media reads,
folder creation and bounded streamed uploads.
Keep [stable catalog order](docs/defects/media/split-catalog-order-drift.md)
and wait for [short-lived writer contention](docs/defects/media/batch-storage-writer-contention.md).
Serve the previous bytes while a replacement is prepared and installed. Load
folder branches and file pages on demand. Resolve SDK metadata in one batch
and support declared add-on file references in deletion and portable restore.
Fix [public-read contention](docs/defects/media/public-file-read-catalog-contention.md)
and recover [abandoned writer markers](docs/defects/media/abandoned-site-writer-marker.md).
Restore add-on file references [after replacement](docs/defects/media/addon-files-checksum-restore.md)
and export data with [missing files](docs/defects/media/addon-export-dangling-file.md).
Add [link repair retry](docs/defects/media/file-move-reference-retry.md),
[file-level edit guards](docs/defects/media/file-card-catalog-revision.md) and
[picker MIME validation before storage](docs/defects/media/picker-mime-after-save.md).

## CMS 0.16.1 (2026-11-21)

Show the active version and update source on each add-on card. Update from GitHub
or a file there, and connect a GitHub source to an exact installed package.
Clear [completed update status](docs/defects/addons/completed-update-shown-as-candidate.md)
from the active form after reconciliation.

Align [add-on card actions](docs/defects/addons/card-action-vertical-alignment.md)
to the top of their row.

Show [loading feedback for add-on actions](docs/defects/addons/card-operation-progress-missing.md)
on the affected card or workspace control.

Group the [selected add-on file with its chooser](docs/defects/addons/package-picker-grouping.md)
and separate the package actions.

Use a clearer [shared refresh icon](docs/defects/admin/refresh-glyph-legibility.md).

Preserve the [system document role](docs/defects/admin/addon-page-system-role-dropped.md)
in add-on page summaries.

Keep the [add-on browser test gates](docs/defects/qa/addon-browser-promise-target.md)
compatible with the release TypeScript target.

## CMS 0.16.0 (2026-11-20)

Keep concurrent rendering element creation from conflicting on shared guards
when each request has its own reserved key. See the
[creation fix](docs/defects/hooks/numbered-element-write-contention.md).

Allow repository installation and update checks from private GitHub repositories
through a read-only GitHub App. Replace PEM keys by copying them into the
configured directory. Compose preparation connects the private key directory
to the app automatically when a Client ID is configured.

Let System Admin check for and install GitHub updates from individual add-on cards.

Keep add-on menu counts inside their buttons without adding a gap below the
administration header. See the [layout fix](docs/defects/addons/menu-badge-spacing.md).

Allow Manager to publish individual pages and apply route changes by default.

Register add-on Actions with their active runtime. Delegate bound screens and
check the current site grant before routing protected requests and committing writes.

Give Site Admin full dump creation and restoration for assigned sites.
Add separate installation-wide dump actions for System Admin. Apply the same
heading spacing throughout Settings and theme the access fieldsets.

Organize the administration source by feature and move its interface copy
into typed locale catalogs. The language selector uses the locale registry.

Add SystemAdmin, SiteAdmin and Manager, custom site roles, and access groups.
Seed read-only Global and Site administrator groups and enforce stored action
grants for both administrator roles.
Allow the console administrator creation script to assign Site Admin to a
selected site with `--site-id`.
Site permissions grant complete actions, with Own and Groups scopes for the
supported page, chunk and snippet endpoints.
Organize Access into tabs and group grants by domain, with synchronized action
copies and short notices. Add account creation with built-in and custom site
roles. Give Manager an editable default editorial policy and use effective
actions to control administration navigation and workspace controls.
Show the selected address in the virtual-folder page creation link and require
the URL catalog, page creation, and URL materialization actions to display it.
Explain the draft read grant in role settings and when opening a protected page
link. Return an acknowledgement when a writer cannot read the saved draft.
See [draft update response scope](docs/defects/pages/draft-update-response-read-scope.md).
Explain missing page-list access in the page editor and next to the position
grant in role settings.
Explain unavailable page publication settings while preserving draft saves and
independently authorized published output.
Let authorized publishers publish an existing saved draft with its stored
address and rendering configuration.
Explain the reach of site-wide publication and URL metadata in scoped roles.
Check draft access before linking from the URLs catalog to a page editor.
Explain read-only template variable values and expose them without requiring
access to page publication options.
Link from page and template assignments to read-only JSON-LD profiles when the
user has catalog read access.
Preserve the Open Graph image address in the editor when the media library is
unavailable and require content read for private picker thumbnails.
Explain which draft read access is needed to use a page preview in the editor.
Require JSON-LD catalog read for the settings link in the preview menu.
Make draft save the primary source action for writers without site publishing
access and explain who can apply the saved changes.
Show accessible page contexts in source previews and explain missing page or
preview-document read access.
Link source usages only when the target editor is readable and explain the
missing access next to the usage list.
Explain why upload and folder creation need the media library list, including
for roles with only one of those write actions.
Require reference review for file rename, move and delete in the workspace.
Keep the file name and metadata readable with guidance when review is missing.
Show the old and new addresses before updating file links, and link only
readable usage targets. Repair [literal Snippet links during file moves](docs/defects/media/file-move-skips-snippet-links.md)
while preserving unrelated drafts and retained releases.
Explain missing file content access next to the readable metadata.
Preserve existing route relationships when changing a path or redirect status
without URL search access.
Keep linked page summaries visible in URLs and explain when opening the draft
requires page read access.
After a saved route fails to activate, tell the writer who can apply it. Allow
routing publishers to apply existing changes without the catalog or replay.
Explain main Settings read access and rebuilding with saved settings. Guide
writers to a site publisher after a public origin change needs a sitemap refresh.
Let Hook authors create a draft without subscription access and explain who can
attach it. [Open the new subscription after saving](docs/defects/hooks/attachment-editor-navigation.md).
Explain missing add-on screen permissions in management and protect unbound
screens and their runtime assets from delegated access.
Correct [account row action target size](docs/defects/admin/account-action-target-size.md)
in the account editor.
Align the controls and compact the responsive table in
[Transliteration settings](docs/defects/admin/transliteration-table-alignment.md).
Move the [Access heading](docs/defects/admin/access-heading-spacing.md) closer
to its tabs.

Add an explicit local [administration release gate](docs/cms-development/admin-release-tests.md)
for Pages, Templates, Chunks, Snippets, TVs, Files and URLs: a real fresh-site
browser journey plus bounded parallel focused suites. Fix TV workspace direct
navigation, mobile draft-validation focus and preservation of pending file
organization fields. Refresh existing fixtures against current CMS contracts.

Expand the administration gate after a control-by-control coverage review:
nested parameter contracts, readonly saved/public document views, Snippet options,
TV defaults and conflicts, partial file-upload recovery, metadata clearing and
URL rejection/promotion. Include existing desktop/mobile hierarchy checks.
Fix [Array item parameter edits](docs/defects/admin/array-item-parameter-kind-lost.md)
and [TV default accessible labels](docs/defects/admin/tv-default-label-collision.md).

Cover the remaining administration scenarios with real browser journeys: nested
contracts through publication and execution, invalid TypeScript correction,
TV reassignment/stale media, document/responsive replacement, nested folders,
competing file editors, URL conflicts/cycle refusal, and recovery after transport
failure, lost acknowledgements and actual session expiry. Include existing TV
version/cache runtime regressions and fix exact fixture selection, locale-script
scope, asynchronous field waits and isolation from unrelated background delivery. See the [remaining-scenario evidence](docs/changes/0.16.0/admin-site-journeys/80-remaining-scenarios.md).

## CMS 0.15.3 (2026-11-18)

Fix incremental page/routing publication with a retained Request page's
[site favicon](docs/defects/publication/retained-favicon-rejected.md), preserve the
[configured favicon in authenticated publication](docs/defects/publication/admin-favicon-source-missing.md),
and [refresh newly created page URL state after partial publication failure](docs/defects/admin/new-page-partial-publication-state.md).
Nested literal paths, including `.php` suffixes, remain supported.

## CMS 0.15.2 (2026-11-18)

Restore the header version button's shared dotted underline for same-screen
actions, preserving Popover dismissal and keyboard behavior. Complete the
release workflow preflight; see [release evidence](docs/changes/0.15.2/release-readiness/50-verification.md).

Dismiss header build information with Escape or an outside click using the
existing Popover, preserving keyboard focus, metadata and mobile containment.
Correct stale routes and settings expectations in the responsive deployment UI
fixture. Four focused browser scenarios pass; see the
[fix evidence](docs/changes/0.15.2/cms-build-info-dismissal/50-verification.md).

Align CMS/admin/lock metadata at 0.15.2; the source artifact records exact commit
and payload provenance independently of site installation state.

Target 0.15.2: review all 38 add-on/calibration/deployment/hooks use cases and
used adapters. Correct 12 production bugs in evidence/journaling, hook ordering
and command/worker lifetimes, delivery health/cleanup and add-on failure/disposal
ownership. Move catalogue implementation out of DI composition. Verification:
288 selected unit/adapter/composition/architecture checks and 26 real integration
scenarios passed; one unchanged POSIX-only helper test is excluded on Windows.
No confirmed vulnerability. See the [bounded audit](docs/audits/0.15.2-addons-calibration-deployment-hooks.md)
and its canonical defect inventory.

Target 0.15.2: review all 38 installation/JSON-LD/media/publication operations
and involved adapters. Correct technical-error masking, stale media projection
installation, staging/lock and preview recovery, and unbounded binary transfer or
unobserved asset work. Fix current-contract and file-ownership QA fixtures;
consolidate duplicate catalog tests while preserving unique coverage. Record
9 production and 2 QA bugs, with 333 selected unit/adapter/architecture tests and
39 real integrations passing; no confirmed vulnerability. See the
[bounded audit](docs/audits/0.15.2-installation-jsonld-media-publication.md) and its
canonical defect inventory.

Target 0.15.2: audit all 22 admin-auth/admin-users/pages operations and their
adapter boundaries. Fix false archive/move conflicts on omitted document defaults
and asynchronous repository error translation. Add substantive rollback, safe
projection, publication failure and session-store regressions. Correct stale QA
fixtures and remove tests of a locally invented page-creation helper, an invented
DI token and redundant method inventories. Record 2 production and 8 QA bugs in
the [bounded audit](docs/audits/0.15.2-admin-auth-users-pages.md); no confirmed
vulnerability in this review. Clarify actionable error recovery and the concrete
low-value test examples in the development standards.

Centralize feature lifecycle, design, testing, security verification and existing-
feature review standards in `docs/cms-development/`, with mandatory AGENTS.md routing.
Move shared requirements out of scoped instructions and README verification
sections. Require relevant integration tests to pass before completing a feature;
supersede the initial five-use-case cadence while preserving historical decisions.

Persist resumable feature/bug knowledge in `docs/changes/<version>/<slug>/`,
using the agreed target release; only documentation-only work may be unversioned.
Use one stage/TDD-step state filename and separate behavior, affected functionality,
design, cases, verification and decision artifacts. Require backend RED/GREEN/
REFACTOR evidence, define substantive unit/integration coverage and exclude
barrel-export inventories, enum-literal assertions and other declaration-only tests.
Illustrate low-value tests with missing guarantees and meaningful alternatives,
including mock-only, mirrored-oracle, weak HTTP/error and fake-integration checks.

Require explicit user/operator error outcomes and safe recovery paths; ask the
owner when business handling or precedent is unclear. Add `docs/defects/` with
selective area indexes and canonical prevention/regression records for confirmed
bugs/vulnerabilities. Seed two historical bugs from existing shutdown audit
evidence without claiming new runtime verification or comprehensive catalog coverage.

Deduplicate all repository AGENTS.md instructions against the development
standards and existing owning contracts. Use one stage/scope reading route and
focused resume evidence instead of repeatedly loading whole standards/dossiers;
retain scoped product rules and all applicable verification obligations.

Require feature completion reports to count confirmed bugs/vulnerabilities and
enumerate created defect cards with explicit kind, explanation and actual status.
Track a scoped inventory across resumptions; distinguish zero findings, reused
records and historical imports without loading the whole defect catalog.

## CMS 0.15.1 (2026-11-17)

Verify composition-module imports after switching to UID 1000 in both Docker
image targets. Unreadable SDK/workspace dependencies, missing role modules and
root-only verification now fail the build before an image is produced. The check
does not bootstrap CMS or require MongoDB or Cloudflare credentials.

Run real Docker regressions before release publication, including restricted
SDK permissions, missing composition modules and the service-user requirement.

## CMS 0.15.0 (2026-11-16)

Unify compact by-site and scenario metric tables. Style inline text actions with
the shared green accent, dotted underline, pointer cursor and hover feedback.

Show scenario metrics in compact 2x2 tables and color retained calibration statuses
with the shared warning/danger/success palette, preserving localized labels.

Document native add-on workspace layout: drawers below tabs, editor-only toolbar,
related form columns from tablet width, and shared action glyphs.

Pin security-patched Mongoose 9.11.4 and TypeScript ESLint 8.73.0. Add an
isolated regression against inherited built-in corruption from dotted Mixed
input; exact runtime dependency validation remains enforced.


Reuse compact controls in drawer pagination and provide a shared page-number
input without native spinner buttons; retain larger targets on coarse pointers.
Narrow page fields and account for nesting margins so child pagination stays
within the tree row boundaries.

Open selected Local HTTP loopback site addresses from the database at startup,
using the existing coordinator and gateway. Cancel startup on database or local
bind failure, roll back listeners and retain administration links. Distinguish
ready local listeners from origins requiring external routing; publication is
still required for each public page.

Add live add-on updates with immutable candidates, compatible rolling replacement,
exclusive migration pauses, shutdown notification and a 20-second forced-stop
budget. Move add-on execution out of the installation coordinator. Add the
administration package upload/apply/status workflow and retain SDK 0.4.0
contract bytes for installed runtimes; new add-ons use SDK 0.5.0.

General settings now report every CMS process PID/state, including administration and temporary replacements. Calibration retains per-site add-on versions/digests/configuration hashes and supports declared public API steps after pages, with visit and per-request metrics. Changed add-on composition requires recalibration. Existing owned API URLs remain valid for package updates.

Verify real Docker quota application and recovery with isolated Events/Bloglist
sites. Fix the production helper network namespace so its loopback generator can
reach CMS; wait for its private socket without a Compose dependency cycle.

Prevent leaked process admissions when a browser disconnects during asynchronous
authentication or routing. Closed requests no longer hold worker shutdown until
the drain deadline; existing graceful and forced-stop budgets are unchanged.
Keep administrator calibration dependencies out of public-only HTTP composition.

Report total startup duration, the actual TCP socket and links to the
administration and site workspaces on readiness. Do not advertise unserved site
origins or a listener's root path as working pages. Configured Local/Public site
origins are listed separately, preserving the administration links. Report the
complete backend/runtime/admin build duration after Vite's stage timing.
General settings now explicitly split
the CMS process total into site, service and dump processes; per-site controls
and totals are labelled separately from the shared CPU quota.

## CMS 0.14.0 (2026-11-15)

Show calibration configurations as labelled 14px lines for application processes
and CPU, database CPU, the per-process connection pool and generator connections.
Include individual process counts when a measurement covers multiple sites.

Calibration availability now explains the observed blocker and recovery action,
including helper connectivity, actual quotas and transient status-read failures.

Calibration now enforces the declared shared database/CMS CPU budget in every
measurement and rejects runs without managed quotas. Profiles show all sites in
compact themed groups; legacy fixed-resource runs remain labelled in history.

Use shared themed controls in calibration forms and history. Align page captions,
URL inputs, percentage controls and removal actions on desktop and mobile. Add
browser layout regressions and verify numeric page references against published
routes and the selected site's serving authority.

Add live resource calibration with persistent profile CRUD, exact traffic shares,
installation-wide profiles, per-site latency criteria and retained measurements.
Managed Docker calibration tunes site processes, fractional database/CMS CPU and
per-process database pools through an independent helper-side generator. Native
installations can edit profiles and history but cannot run without managed quotas.
Journal and restore temporary settings on completion, cancellation and restart. Add Settings /
Calibration and ten recent results with explicit Apply in Settings / Main.
See [calibration](docs/arch/resource-calibration.md).

Harden global resource operations with explicit active installation-administrator
checks and finite CPU/positive process validation at the HTTP boundary. Add
regressions for anonymous/revoked sessions, forged identity, CSRF, WebSocket
hijacking, prototype payloads, private worker/file access and Unix-helper
credentials. See the [focused security review](docs/audits/0.14.0-resource-security.md).

Preserve fractional Linux CPU quotas independently of rounded available-parallelism
counts, while respecting the actual process affinity mask and legacy cgroups.
Resource recommendations and dump admission use the full detected budget.

Recover a reset reused coordinator-to-worker HTTP connection once for bodyless
GET/HEAD requests before response headers, using a fresh connection. Do not replay
POSTs, request bodies, fresh-connection failures or partially delivered responses.
Cover retry bounds, client cancellation and committed writes with real HTTP tests.

Verify publication under continuous traffic across warm fork processes, including
static/Request pages, in-flight old documents, retained assets and failed staging.
Add failure regressions for long-request draining, worker/coordinator crashes,
unavailable MongoDB, concurrent admin saves, streamed disconnects and repeated
reconfiguration. Preserve the last saved allocation on storage failure, remove
failed temporary files and retired worker records/listeners, and restore capacity
if a successor crashes during its predecessor's drain. Share an in-flight stop
between overlapping shutdown paths and reject late readiness after shutdown.

Outline individual site allocation cards only when multiple sites are present;
the shared CMS processes section has no surrounding frame.

Keep resource-application feedback visible for fast saves and center its loader
inside the visible form area while scrolling/resizing. A completed save explicitly
labels the button as saved; subsequent edits re-enable it. Explain dump behavior
in the context of Settings / Dumps / Create dump in production.

Configure each site's process database-pool maximum from Resources, including on
one/two CPUs. Replace serving processes one at a time without restarting the
coordinator; preserve old workers on replacement failure and show saved/applied
sizes separately. The coordinator's startup pool remains explicitly separate.

Reuse coordinator-to-worker HTTP connections and keep hop-by-hop connection
headers local to each network hop, preventing TCP-port exhaustion under load.
A failed background session check keeps the current admin workspace and edits
mounted, shows a retry notice and recovers automatically; HTTP 401 still signs out.

Resource allocation shows a visible circular loader while applying. Background
refreshes keep the form usable and cannot overwrite newer edits/save results.
Bound request and response-body waits; a lost save reply triggers reconciliation
without retaining the global busy state, including when changes already applied.

Startup reports HTTP-port and coordinator-file conflicts explicitly, including
an already running Docker app, without exposing private exception details.

One coordinator directly owns site and dump children through `fork`, including
draining, crash replacement, cancellation and interrupted-capture recovery.
Database placement is explicit: managed local, separately managed local or
remote. Remote database CPU is not deducted from the application host. Remove
derived memory/connection process caps; CPU recommendations remain advisory.
Per-process MongoDB pools have an independent deployment setting. See
[ADR 0083](docs/adr/0083-fork-supervision-and-database-placement.md).

[Contracts and acceptance criteria](docs/arch/0.14.0-site-process-allocation.md):
CMS-managed serving processes without PM2; connected sites, CPU capacity and
per-site allocation in Settings / General. Sites with at least two processes
temporarily lend one of their own processes for dump capture. A single-process
site uses any positive spare CPU remainder, including 0.1 CPU, or captures inline
when no remainder exists. Defaults leave spare capacity unassigned. Includes coordinated
maintenance/recovery and visual MongoDB CPU quota control through an explicitly
configured Docker integration, including fractional CPU equivalents.
Show the logical CPU count and one load graph per CPU, with samples every second
from admin login over an authenticated WebSocket, without server-side history;
stop collection when the last admin disconnects. Recommend a total worker count rounded up from the effective
CMS CPU budget, without blocking extra sites or workers. Include local two-site
load verification without hosts-file edits, correlated with per-worker metrics.
Verify configured process budgets and isolation of one site's serving event-loop
freeze from another site's workers, separately from shared-resource saturation.
Align CMS/executor image tags with the release version and both Compose files
with the verified MongoDB 9.0.8 image, pinned by exact version and digest,
with upgrade compatibility and release consistency checks.
See [ADR 0082](docs/adr/0082-site-process-allocation.md) and the
[verification report](docs/audits/0.14.0-site-process-allocation.md).
Publication and installation upgrades remain separate actions.

## CMS 0.13.0

File uploads and replacements are fixed. Files can be renamed inline or moved
between folders by drag and drop. Address changes offer to update references,
including generated image variants, and immediately refresh published pages and
HTML caches while preserving other draft content. Missing media addresses remain
editable with a warning instead of breaking the administration. Image variants
show localized file sizes; long reference paths are shortened inside dialogs.

Mobile administration has a compact header and controls. Publication comparison
moves into the scrolling status area without moving the active text field when
it appears. Page statistics hide the unreadable mobile resolution caption.

Favicon uploads in Settings / Main reuse the standard media input from TV fields,
with an icon preview, filename and metadata, without a resolution selector.
Uploaded icons are explicitly linked in HTML. Replacement and deletion update
published pages immediately without publishing other draft changes.

## CMS 0.12.1

[Unpublished page draft visibility](docs/arch/0.12.1-page-draft-visibility.md):
consistent indicators in the Pages drawer and a unified editor status area with
icons, changed-field markers, a readonly published-form view, stable editor
controls and clear sitemap/robots.txt explanations. Compact buttons are 36px,
normal buttons are 44px, and full rebuild is in Settings / Main.

[Prepared TV loss during incremental publication is fixed](docs/arch/0.12.1-page-draft-visibility.md#publication-defect-prepared-tvs-in-page-catalogs),
which can remove images and descriptions from catalog cards.

## CMS 0.12.0

The [0.12.0 scope and acceptance criteria](docs/arch/0.12.0-rendering-performance-plan.md)
are implemented through verified publication catalogs, retained plan fingerprints,
prepared style hashes and page Markdown, Worker-thread refresh 20 seconds before
HTML-cache expiry, and dump creation in a separate operating-system process.
TTLs of 20 seconds or less do not refresh in the background; the page editor
explains this when a short TTL is entered. See ADRs 0070–0075 and the cache/dump
contracts for bounds, failure behavior and process coordination.

## Changes in 0.10.0

HTML pages now have negotiated Markdown representations and private saved-draft/
published previews. Site-owned JSON-LD profiles and shared Organization/Person
objects produce immutable graphs from page fields, TVs and prepared Snippet data.
Incremental and routing-only releases preserve published content while refreshing
shared graphs and addresses. Delivery and restoration share a durable exclusion
boundary. See [contracts and upgrade notes](docs/arch/markdown-and-json-ld.md).

## Changes in 0.9.2

Delivery confirmation supports Request homepages without injecting undeclared
query parameters. WOFF2 is accepted as a detected file format, retained in the
media library and served with font/woff2. Uncertain delivery diagnostics retain
the operation stage, safe reason, HTTP status and recovery action.

The administration header derives its CMS version from the root package.json.
Select that version to inspect packaged commit and payload SHA-256; the site's
name opens its configured serving origin in a new tab. Release source archives
have a verifiable file inventory and a separate archive checksum.
See [release artifacts](docs/arch/release-artifacts.md).

Apply and verify the additive 0002-deployment-diagnostics migration when upgrading.
Retain installation settings, content, accounts, media and existing publications.
Theme packaging and automatic theme installation remain deferred.

## Changes in 0.9.1

Fixed administrator sign-in through the Cloudflare gateway. The Worker now
preserves the browser's `X-Zarya-Admin` CSRF marker while continuing to remove
forged service headers. Regression tests cover sign-in, session reads, logout
and rejection of missing/invalid CSRF markers and foreign origins. Existing
administrator accounts and passwords remain valid; no database migration is required.

When upgrading from 0.9.0, rebuild the deployment executor and redeploy the Worker.
Restarting the executor alone does not replace an already deployed Worker. After
finishing or reconciling any in-flight delivery, save the existing target again
in **Settings / Deployment**, or run `deployment.js configure` through the
[Cloudflare installation procedure](docs/installation/en/cloudflare.md).
This queues the current published release. Wait for confirmed `Succeeded` status.
