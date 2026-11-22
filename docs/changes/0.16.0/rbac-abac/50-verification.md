# Documentation verification

Branch `0.16.0`, baseline `f63d9c5`. This pass checks the MongoDB design and
consolidated add-on authoring documents in the working tree. The current CMS
package metadata is `0.15.3`; `0.16.0` is the design target.

- `git diff --check` passed. A Markdown scan checked new relative links and
  anchors and whitespace in new files.
- JSON parsing confirmed all 237 existing action records, their unique IDs and
  their boolean CRUDE fields. The proposed schema lists eight collections.
- A scoped documentation search confirmed one authoring location each for the
  runtime pack command, the SDK pack command and the server extension example.

This initial documentation pass preceded implementation. Runtime and MongoDB
evidence is recorded below.

Migration RED on 2026-11-19 used `npm run test:integration -- test/integration/rbac-migration.integration.spec.ts`
with an isolated MongoDB 8.0.29 replica set and a random database name. Existing
migrations and fixture insertion completed. The assertion failed because the
role query returned an empty array instead of the three built-in roles.

Migration GREEN passed the same isolated test, including strict assignment
validation, existing-user backfill and replay. The manifest regression had a
pre-existing list ending at 0005 and needs alignment with recorded migration
files.

Admission RED used `node node_modules/vitest/vitest.mjs run test/adapters/rbac-admission.spec.ts`.
Before enforcement, the foreign-site SiteAdmin request and the Manager's
ungranted page list were both admitted.

## Built-in roles and site action verification

- The 60 focused unit checks include endpoint admission, migration handling,
  account lifecycle, and add-on declaration validation. The grant regression
  first failed because a Manager with an explicit page-list grant was denied.
  Add-on declaration tests reject unknown domains and protected CMS paths.
- `npm run test:integration -- test/integration/rbac-migration.integration.spec.ts test/integration/admin-users-http.integration.spec.ts`
  passed on the isolated MongoDB replica set. Coverage includes legacy account
  backfill, repeat application, assignment validation, site picker filtering,
  SiteAdmin's site settings and installation restrictions, a Manager grant and
  revocation with the same session, custom role creation and removal, and
  independent site group membership and archiving.
- `npm run test:integration -- test/integration/admin-auth.integration.spec.ts`
  passed 13 cases covering the existing authentication and session behavior.
- `npm run test:integration -- test/integration/admin-user-console.integration.spec.ts`
  passed using the built console entry and isolated MongoDB.
- `npm run test:integration -- test/integration/admin-users-ui.integration.spec.ts`
  passed all nine cases in headless Edge. The SiteAdmin regression verifies the
  visible Main and Access tabs and absence of installation General. The access
  editor test saves Own and Groups on a custom role, saves a group and verifies
  that CRUDE appears in the catalog view.
- Formatting, lint, server and Svelte type checks, builds, and Git whitespace
  checks passed. The final focused unit run passed all 102 cases, including
  the admission policy, migration manifest, page and element operations and
  the layer boundary check.
- The runtime catalog contains 204 core action declarations, the 201 baseline
  endpoints plus three site access actions. Both new migration files use LF.
  The earlier migration files match the baseline.
- Four MongoDB integration suites passed 26 cases covering migrations, sessions,
  account lifecycle, address and site admission, and page, chunk and snippet
  object scopes. The HTTP test covers group assignment, a write interrupted by
  group archival, and portable capture and replacement of owned content. The
  portable copy omits local authorization attributes and the target retains
  its existing creator attributes after replacement.
- The full unit run passed 1,577 cases, skipped one, and reproduced the
  frozen-JavaScript snippet timeout from clean HEAD. The complete dump suite
  passed eight cases and reproduced the same two baseline failures for file-only
  element population and the restored active release. The isolated
  authorization dump check passed.

One product bug was confirmed and fixed. The account editor displayed 36 px
targets under a fine pointer at narrow widths. Its canonical record is
[admin/account-action-target-size](../../../defects/admin/account-action-target-size.md).
No new vulnerability was confirmed by these checks.

Declaring add-on activation and enforcement remain open. Legacy public and
SystemAdmin admission and manifest declaration validation are covered.

Access follow-up RED. The existing real-HTTP account test, extended with the
Manager default policy, failed at the assigned site's page list with 403 where
200 is expected. The test used an isolated UUID-named database.

Access follow-up GREEN. The focused adapter and architecture run passed
17 tests. The Edge account and site-access suite passed 10 tests, including
read-only administrator policies, checkbox mirroring, immediate Escape,
timed dismissal, tab and button alignment, custom role creation, and a Pages
create-only account with no page list or publication requests.
The HTTP and migration integration files passed in separate temporary MongoDB
databases. The command used a 45-second timeout after a concurrent run hit
the 20-second default on this machine.

Built the local 0.16.0 preview and applied and verified migration 0017.
The restored homepage returned HTTP 200. A real SystemAdmin created a temporary
Manager in the browser. The Manager could open Pages, Chunks, Snippets, Files,
and URLs and use their read APIs. Site settings returned HTTP 403. The two
temporary accounts were removed, and the local verification server was closed.

Access workspace alignment. In Edge, the first tab started 16 px to the right
of the workspace heading before the fix. After removing the nested horizontal
padding, the heading, tabs and table's outer border share the same left edge.
The focused browser scenario passed for both the CMS and local preview bundles.

## Automatic draft URLs and transliteration

- RED: `npx vitest run test/app/pages/create-page.spec.ts -t 'requires a heading'`
  created a draft from a blank H1 when the caller needed an automatically assigned URL.
- GREEN: the focused page use-case suite passed after adding the H1 guard.
  The combined domain, application, admission, migration and persistence run
  passed 44 tests, including a transient conflict before commit and routing
  check denial. The HTTP adapter suite passed all eight cases on loopback.
- The two RBAC HTTP scenarios and the migration test passed against isolated
  MongoDB databases. The custom role without URL permissions exercises the real
  HTTP session, site settings and MongoDB routing records. It also verifies an
  interleaved claim of the same path, rollback and retry with a suffix.
- Two focused Edge scenarios passed against the built administration bundle.
  They verify the create-only editor, the ten language choices, localized
  empty and space hints, saving a literal space, and actual row positions at
  600 px, 900 px and 1440 px.
- Server and Svelte typechecks passed. The admin bundle built successfully.
- All 14 routing integration cases passed after the suite was isolated from
  checkout artifacts and its lost-acknowledgement fixture was bound to the
  real hook-aware repository.

### Transliteration layout follow-up

The [layout defect](../../../defects/admin/transliteration-table-alignment.md)
was reproduced in headless Edge. The old 79 px rows had an off-center input and
the desktop table rendered three wide columns. The updated regression verifies
centered buttons and inputs, unchanged input geometry when a hint appears, and
one to four columns at 600, 900, 1100 and 1440 px.
The browser scenario passed for both CMS and local preview bundles.

### Final 0.16.0 transliteration defaults and migration

The lowercase, punctuation and whitespace regressions failed against the
previous defaults. The updated domain, site/page use-case and migration tests
passed 36 checks. The Edge regression checked the Settings menu order,
space rejection and the saved hyphen switch. Three focused MongoDB integration
scenarios passed, including a custom role generating a URL with the switch off.

The four pre-release migrations were consolidated into
`0015-rbac-and-transliteration`. A new local database restored the existing
site dump under its verified schema before applying the combined migration.
The restored homepage, admin login and public admin bundle returned HTTP 200
from the configured local paths after the cutover.

### Users tab in Access settings

The focused Edge test first failed because the Access workspace had no Users
tab. All 11 browser tests passed after moving the account list and its controls
to that tab. They cover listing and creating accounts, the Russian tab label,
and keeping the tab and its requests unavailable to SiteAdmin. The admin bundle
built in both projects, and the restored local site, admin login and rebuilt
bundle each returned HTTP 200.

### Access heading spacing

The [layout defect](../../../defects/admin/access-heading-spacing.md) reproduced
in Edge at 390 px and 1440 px. At 1440 px the heading was 24 px from the
Settings submenu and 48 px from the Access tabs. The regression now verifies
that the heading sits closer to its tabs at both widths. All 11 tests in
`admin-users-ui.integration.spec.ts` passed against the rebuilt CMS bundle.
The focused regression also passed against the rebuilt local site bundle.

### Built-in administrator groups and grants

RED: the isolated MongoDB HTTP test removed the SystemAdmin grant to read site
settings. The dispatcher still returned HTTP 200 with the same session.

GREEN: migration 0015 seeded both group definitions and the built-in policies.
The real HTTP test returned 403 for both administrator roles when the grant was
absent and 200 after restoration. It also verified visible membership, direct
rejection of attempts to archive either group, and normal custom group
archiving. The HTTP and migration files passed all three tests. The routing
integration file passed 14 tests. The admission, migration and add-on package
adapter files passed 17 tests. The Edge settings file passed all 11 tests, and
its group scenario passed again after the final admin build. Server and admin
typechecks, scoped ESLint and Git whitespace checks passed.

The 0.16.0 preview database has the earlier 0015 migration receipt. The revised
pre-release migration was verified on isolated databases initialized from the
prior schema.

### Inline role selector

The Edge regression reproduced a stacked label at 576, 768 and 1440 px.
After the CSS change, it verified that the label, selector and Save button
share a row at those widths, while a 390 px viewport keeps the label above
the selector. All 11 settings browser tests passed. Both admin bundles built,
and the focused Access scenario passed against the local site bundle.

### Site Admin creation from the console

RED: the console adapter ignored the site identifier and the creation use case
prepared the installation setup hook for a scoped account.

GREEN: eight unit and composition tests passed. Two isolated MongoDB CLI
tests passed for default SystemAdmin creation, scoped SiteAdmin creation and
rollback when the site does not exist. They also verified that the first
SystemAdmin, after a scoped account, completes installation setup. The revised
script passed the Git Bash syntax check and ran interactively against the local
preview. Browser verification confirmed login, Site group membership, and
forbidden responses for installation settings, installation users and another
site. The local server was closed after the check.

### Dump access, installation restore and process scheduling

The initial Site Admin tests reproduced the missing Dumps tab and missing
full-archive restriction. The HTTP fixture verifies both site operations and
both installation operations against two sites in an isolated MongoDB database.
It checks Global-group access, archive format separation, replacement of files
and data, and revocation of administrator sessions after installation restore.

Playwright ran the production admin bundle in headless Google Chrome against
the real supervisor. In both archive scopes, capture kept the single serving
process and used no child. With two serving processes, a capture child ran in
the borrowed slot and exactly one serving process was replaced. The fixture
also checked that maintenance drains a held write from the other site. The
Settings browser fixture verified Site Admin visibility and common heading
placement at 390 and 1440 px.

The supervisor test recovered an interrupted installation restore before
serving requests. The ten full-site dump regression tests passed after moving
the favicon scenario onto a dedicated site. The local preview applied and
verified migration 0016, including the two site grants and the two
installation-only mutations.

### Virtual-folder page creation link

Working tree based on `5cf14ea` on `0.16.0`. The new Playwright case first
failed on the previous English label after confirming the link was absent
without the materialization grant.

- `npm run test:integration -- test/integration/admin-users-ui.integration.spec.ts -t 'shows the selected virtual folder address|opens page creation without requesting the page tree'` passed both cases in headless Chrome with intercepted API fixtures. The checks covered missing materialization and page creation grants, English and Russian labels, changes to the selected address, the encoded link target, and wrapping a long path at 320 px.
- `npm run test:integration -- test/integration/admin-urls.integration.spec.ts -t 'creates redirects and pages for virtual folders'` passed in headless Chrome with an isolated MongoDB replica set. The browser followed the address-specific link to the prefilled editor and saved a draft. The test also verified branch adoption and redirect behavior.
- Formatting, lint, type checking, the administration production build, and `npm test -- test/architecture.spec.ts` passed. The build emitted the existing Vite chunk-size warning.

Defects confirmed in this follow-up: 0 bugs and 0 vulnerabilities. Defect
records created: 0.

### Interface recommendation 1. Page positioning

On the production admin bundle from `f59800a`, the new Playwright scenario
reached the real role editor and failed at the missing list-scope hint.

With the changes, `test/integration/admin-users-http.integration.spec.ts` and
`test/integration/admin-page-tree.integration.spec.ts` passed three selected
Playwright cases. The real login was isolated to a temporary MongoDB replica
set. The checks covered live role toggles, direct page access without a list
request, both interface languages at 390 px, a drag attempt with list-only
position access, and persisted position after an authorized drag and reload.
The previous linked draft read/write regression also passed.

Formatting, lint, type checks, the administration build, the architecture test
and `git diff --check` passed. Vite reported its existing chunk-size warning.
No newly confirmed product defect or vulnerability. Reused the
[browser fixture drift record](../../../defects/qa/admin-release-fixture-drift.md)
for the existing page-tree fixture. New defect records: 0.

### Interface recommendation 2. Draft editing without publication options

The new scenario failed on the prior bundle at the missing role hint. The
updated production bundle passed two focused cases in
`test/integration/admin-users-http.integration.spec.ts` against the temporary
replica set. The browser verified the role toggle, absence of a page-options
request, a persisted draft edit, the separately authorized public availability
indicator, retained published Markdown and published JSON-LD without any
availability grant. Page options restored the settings fields, and revoking
the published-output grants removed their controls. The earlier real role and
draft access regression also passed.

The administration build, lint, type checks, architecture test and whitespace
check passed. No newly confirmed bugs or vulnerabilities. New defect records: 0.

### Interface recommendation 3. Publish a saved draft

The new real-session case reached the publisher editor and failed on the old
bundle at the missing page-options guidance. The updated bundle passed in
`test/integration/admin-users-http.integration.spec.ts`. A publisher without
draft update saw the missing options, URL and template states. A configured
page sent one publication request with an empty body and published the saved
content. Another request committed a release but lost its browser response;
the action stayed disabled with reload guidance. Granting draft update restored
the combined Save & publish action. The final focused run passed all three
positioning, publication-options and saved-draft scenarios.

The admin production build, type checks, lint, architecture test and whitespace
check passed. New bugs, vulnerabilities and defect records: 0.

### Interface recommendation 4. Site-wide metadata

The previous production bundle failed at the missing mixed-role warnings.
The selected real Playwright case in
`test/integration/admin-users-http.integration.spec.ts` verified two distinct
warnings, removal when an action was unchecked, metadata for an outside page in
both site options and URLs, read denial for its draft, and working editor links
for an owned page and a group page. The existing URLs browser scenario passed
with its two prerequisite fixtures in `test/integration/admin-urls.integration.spec.ts`.

The admin build, lint, type checks, architecture test and whitespace check
passed. New bugs, vulnerabilities and defect records: 0.

### Interface recommendation 5. Read page TV values

The previous admin bundle omitted the tab without page publication options.
The new case in `test/integration/admin-users-http.integration.spec.ts` passed
with real authentication and MongoDB. It verified a read-only native input,
a saved ordinary edit with zero TV write requests and unchanged TV values, a
persisted TV write after adding the save grant, and the absent tab after removing
the page TV read grant. The application TV and architecture checks also passed.
Build, lint, type checks and whitespace checks passed. New defect records: 0.

### Interface recommendation 6. Read JSON-LD profiles

The selected real Playwright case passed in
`test/integration/admin-users-http.integration.spec.ts`. The reader opened the
assigned profile through both Pages and Templates and reloaded the profile link.
The editor disabled the profile fields, offered permission guidance and the
real save API denied submission. The save grant restored editing and the
change persisted. The read grant controlled visibility of the assignment panel.
The preceding TV browser test passed with the shared saved-template fallback.
Build, type checks, source checks and the architecture test passed. New defect
records: 0.

### Interface recommendation 7. Open Graph image access

The new real-browser case reached the Open Graph tab on the old bundle and
failed at the missing file-list hint. The updated bundle passed using an
isolated database and an uploaded synthetic PNG. A writer without the list
grant saw the saved address and its hint without a library request. A draft
metadata update preserved the image. File listing enabled the chooser without
sending private content requests, and adding content read enabled thumbnails.
The existing real metadata journey passed with the same bundle. The build,
lint, type checks, architecture test and whitespace check passed. New defect
records: 0.

### Interface recommendation 8. Contextual page previews

Real Playwright with an isolated MongoDB verified that each standalone preview
grant leaves the Pages section and direct editor unavailable, with no page read
requests. The role prompts for draft read until it is granted. A reader opens
both previews from the existing page without the tree. The JSON-LD settings
link requires separate catalog read. The existing published-output scenario
passed with the new case. The final localized hint passed on a rebuilt bundle.

### Interface recommendation 9. Save rendering source drafts

Real Playwright with an isolated MongoDB created and updated a template, chunk
and snippet as the same delegated writer. The primary draft action displayed
publication guidance. Reload showed the changes, publication received no requests
and release count stayed unchanged. The real publication API denied the draft
writer. Granting site publication enabled Save & apply in all three editors
with the site-wide effect explained. The three publication requests succeeded.
Keyboard draft save and the publication lock passed their browser regressions
after correcting the known session fixture drift. Type checks, build and
architecture checks passed.

The extended case also exercised a Snippet already rendered by an active page.
The delegated browser save, delegated API update and privileged browser Save
draft each preserved the served HTML and release count. The three explicit
Save & apply actions produced exactly three releases and served the saved
Snippet output.

### Interface recommendation 10. Rendering preview context

Real Playwright verified all three source editors with the result or page read
grant withheld, then with both granted and the page limited to Own. The chooser
offered only the owned page and showed its actual compiled HTML. Generation
for the other user's page was denied. The current document was private to its
owner, and withdrawing either read grant denied later requests. Removing the
generation action removed the controls. The prior source save journey passed
alongside it. The preview use-case test, architecture, build, type checks,
lint and whitespace checks passed.

The existing rendering integration file passed nine of ten cases, including
its real browser preview and protected-document HTTP checks. Concurrent numbered
source creation separately received HTTP 409 `StaleWrite`. The same existing
test returned 409 when run with the tracked sources from clean baseline `f59800a`.

### Interface recommendation 11. Source usage links

Real Playwright found all four expected usages with the delegated source
reader. Own chunk read allowed navigation to the owned chunk. The other
chunk, the using template and the page stayed text with one hint, and their
direct read requests were denied. Adding the respective target read grants
enabled each link and opened its real editor. The rendering preview journey
passed in the same run. The deterministic parameter help and publication
diagnostic links also passed. Build, type checks, architecture and whitespace
checks passed.

### Interface recommendation 12. File writes without list

The real browser journey showed the applicable single-operation and combined
guidance at 390 px without a file tree, write inputs or library requests. The
real list endpoint denied that role. Selecting list access removed both role
hints. With list access added, a folder and an uploaded PNG persisted in the
root. The upload submitted the version returned by folder creation. The
existing full browser journey for file uploads, replacement and download also
passed. Build, lint, type checks, architecture and whitespace checks passed.

### Interface recommendation 13. File reference review

Real Playwright verified the independent and combined write grants with
review withheld. Metadata stayed visible. The inline title, organizer, drag
and delete sent no review or write requests. The server denied direct review.
The administrator's role hints followed the review grant. With review, a real
drag opened the dependency dialog and cancel preserved the file. The delete
action reviewed the current usages before offering Force delete. The explicit
confirmation removed the file. The existing Files browser journey and the
Open Graph test passed. Build, type checks, architecture and file lint passed.

### Interface recommendation 14. File move effects

The real browser exercised the operator role without site publication and
without page or Snippet read. It displayed known references, both addresses
and the immediate and historical effects. The role editor described the
site-wide effect of the move action. Adding target read grants enabled the
corresponding links. The modal link opened the actual page editor and closed
the dialog.

The confirmed move persisted new addresses in the file, page draft and
Snippet draft. The live site retained both published markers and gained the
new address. One address-only release was added and stored previous releases
compared equal. The first run confirmed [a media defect](../../../defects/media/file-move-skips-snippet-links.md)
because the saved Snippet still contained the former address. The passing
regression includes this repaired source. The long-reference layout, existing
Files browser journey, HTTP adapter tests, type checks and build passed.
The real variant move and address-only publication cache regressions also passed.

### Interface recommendation 15. File content access

Real Playwright browsed a responsive image under a list-only role. The icon,
MIME type, size, dimensions and variant names were available. The server denied
direct original and variant reads, and the page requested no private bytes.
With content read the thumbnail loaded, the download matched the original
bytes and a variant opened as WebP in its own tab. The guidance disappeared.
The Open Graph private-thumbnail scenario passed in the same run. Build, lint,
type checks and whitespace checks passed.

### Interface recommendation 16. URL catalog and search

The real browser showed the missing catalog guidance at 390 px, without a
tree, address input or catalog request. After adding list access, the saved
parent and redirect target were readable and suggestions were never requested.
Moving the path retained its parent. The operator changed 301 to 308 while
keeping the same destination. Adding search access opened both real selectors
and enabled changing the redirect to another page. Build, type checks,
targeted lint, architecture and whitespace checks passed.
All eight existing real URLs integration cases passed on the same bundle.

### Interface recommendation 17. URL linked page

Real Playwright exercised a role holding only URL list. The card showed the
page name, URL and published status along with draft access guidance, without
a page request or editor link. A direct draft request returned 403. Adding page
read opened the real editor and cleared the hint. The same run verified the
existing Own and Groups scopes. Admin build, targeted lint and type checks passed.

### Interface recommendation 18. Routing publication

The real browser moved a published route successfully as a writer without the
apply grant. One-time failures in the actual release store then produced HTTP
202 for a move and a redirect save. The writer saw who could apply the saved
changes and the active release stayed fixed. The actor with only routing publish
applied the saved state. The browser sent one publish request, the retained
history stayed identical, and both saved changes were active. An injected
missing active release returned a null publication and showed the prerequisite.
All five selected existing URL regressions passed, along with build, targeted
lint, type checks, architecture and whitespace checks.

### Interface recommendation 19. Settings and site rebuild

Real Playwright verified the read-only role and direct write denials. With only
site publication added, the user read the saved settings, saw the rebuild
explanation and published a new release. With settings write and no publishing,
a time-zone change saved without a rebuild prompt. Changing the public origin
showed who can refresh the sitemap. With both write actions, rebuild sent only
publication and kept the saved origin while a different address was in the
form. The existing rebuild journey, admin build, targeted lint, type checks,
architecture and whitespace checks passed.

### Interface recommendation 20. Hook handlers and subscriptions

The real browser created a disabled Check handler on mobile with creation as
its only permission. It sent no catalog read or subscription request. Adding
catalog access let the same actor create an Event from its hook card. The
role with only list and subscription rights attached that handler. A direct
valid subscription command failed with 403 once the grant was removed. Both
grants enabled the combined action and opened the route for the actual saved
subscription. An injected HTTP 503 during attachment preserved the created
draft and a separate successful retry attached the same handler exactly once.
The [navigation defect](../../../defects/hooks/attachment-editor-navigation.md)
and its fix are covered by this browser case.
The existing hook drawer/editor browser case also passed after its session and
optional package catalog were brought up to date with the current host fixture.
System Admin verified that the role editor hint disappears when subscription
access is selected and returns when the selection is cleared.

### Interface recommendation 21. Add-on UI access

ACCESS-21A passed with two installed synthetic packages and real Chrome logins.
The first provided an administrative bundle and declared an endpoint in two
domains. The site administrator saw the missing screen binding hint, had no
site menu shortcut, and opened the connected component through Settings. The
headless package had no hint. A delegated reader kept the authorized catalog and
connection reads, saw guidance on a direct screen URL, and made no screen or
asset request in the browser. Direct runtime manifest and script requests both
returned 403 with the same delegated grants.
The administrator hint was checked in both English and Russian.

ACCESS-21B remains pending. The manifest is validated today, but the serving
runtime does not register its Actions in the catalog or dispatch protected
requests under those Actions. This run covers missing bindings. The bound-screen
and command checks depend on activation-time registration and dispatcher enforcement.

### Combined verification of the interface follow-up

The real HTTP/browser run for `admin-users-http`, `hooks-ui` and
`rendering-elements` passed 34 of 35 tests. All 24 `admin-users-http` cases
and the Hooks drawer case passed. The existing concurrent numbered source
creation case returned `409 StaleWrite` on both the working tree and clean
`f59800a`. A later targeted run passed all three Hooks and add-on browser cases,
including the role-hint transition and Russian copy. The architecture, Hook
configuration and add-on summary adapter tests passed. Admin production build,
repository lint, type checks and `git diff --check` passed.

This follow-up fixed two confirmed bugs and produced two defect records.
See [Snippet media references](../../../defects/media/file-move-skips-snippet-links.md)
and [Hook attachment navigation](../../../defects/hooks/attachment-editor-navigation.md).
No vulnerability was confirmed in the executed checks.
