# Administration frontend

The site-level Files tab follows [ADR 0026](../adr/0026-site-files-and-named-media.md)
and the [Files contracts](site-files.md): a left folder tree, per-file upload
processing choices, image details/geometry, img/picture copying, grouped usages,
Change image, moving/renaming and deliberate Force delete without a confirmation
dialog. The usual mobile drawer/editor transition and site isolation apply.

Implements the initial UI scope under ADR 0001 using Svelte 5, Vite, Bits UI,
strict TypeScript, npm workspaces and the root lockfile/ESLint configuration.
The existing ADR 0012 authentication operations and persistence are unchanged.
ADR 0019 adds publication options and single-page publication operations using
the same existing administrator permissions.
ADR 0020 adds site-level Pages/Templates/Chunks navigation and responsive source
editors. See [the source editing contracts](rendering-element-editing.md) for
entities, backup behavior, routes and protected compiled previews.
Under ADR 0021, new element keys are server-assigned ordinals; source forms edit
names, without a key field. Drawers and template choices show names. Page/source
rows always have a visible background and selected rows have a contrasting border.

## Delivery and configuration

`npm run build` compiles the backend into `dist/` and the frontend into
`admin/dist/`. `npm run typecheck` checks both. `npm run format` and
`npm run lint` apply the shared root policy to TypeScript and Svelte scripts.
Docker builds both outputs with `npm ci` and includes the admin bundle.

Enabled buttons share subtle hover feedback across CMS screens and add-on views.
Drawer pagination reuses the opt-in `cms-compact` controls (36px). On coarse
pointers, drawer controls retain 44px targets. The shared `cms-page-number` input
centers a 36px-wide numeric field and hides native spinner buttons in Chromium,
Safari and Firefox, preserving numeric validation and keyboard access.
Drawer pagination forms account for their nesting margins instead of overflowing
their tree rows with a fixed 100% width.
Secondary buttons use the shared row-hover palette and accent border/text; disabled
controls retain their appearance. Color transitions respect reduced-motion settings.

The existing HTTP composition serves the interface only when both
`ZARYA_ADMIN_ROOT` and `ZARYA_ADMIN_AUTH_ORIGIN` are configured. The root is
resolved once at startup. Only `/admin`, `/admin/`, `/admin/login`, the explicit
site/page routes in ADR 0019 and compiled
CSS/JS under `/admin/assets/` are served; unknown files and source maps return
404. Real paths must remain inside the configured build root. GET/HEAD are
supported, other methods return 405, and a foreign Host returns 403. Responses
disable caching and use a same-origin CSP without unsafe inline script/eval.
Under [ADR 0060](../adr/0060-private-administration-assets.md), only the sign-in
entry's static dependency graph is public. Vite's private build manifest defines
that graph and is validated once before listening. The workspace and its CSS load
after authentication; all other compiled assets require a valid session on GET
and HEAD, including known direct URLs. Missing build metadata prevents startup.
A second HttpOnly cookie scoped to /admin presents the same opaque session used
by the API cookie at /api/admin; current-session reads upgrade existing browsers.
All responses retain no-store caching. Chunk download failures offer reload and
session recovery without repeating login.
This asset boundary is independent of site publication and local operator access.
The backend allowlist is `ADMIN_DOCUMENT_ROUTES` in
`src/adapters/inbound/documents/http/admin/admin-document.routes.ts`: fixed
document paths, the site/page path pattern and the compiled-asset path pattern.
The frontend keeps its own route-to-view mapping in `admin/src/app/admin-route.ts`.

`npm run dev:admin` starts a loopback-only Vite server on port 5173. Its local
API proxy uses the backend port/origin from the root environment. It rewrites
only the two explicit loopback development origins; foreign origins and Fetch
Metadata remain subject to the backend checks. No CORS grants are added.

## Build information

The header's CMS version button opens build provenance (or the local-build
explanation) in the shared Popover. The trigger uses the shared dotted-underlined
text-action style below. Escape or clicking outside dismisses it;
clicking inside leaves metadata readable/selectable. Escape restores trigger
focus. The trigger also toggles by mouse/Enter/Space. Opening/dismissal does not
navigate or change the current site, form, language or authentication state.
Keep the panel inside the viewport on mobile and desktop.

## Interface languages

Under [ADR 0017](../adr/0017-administration-interface-languages.md), the top-right
native select lists the configured locales on login and workspace screens.
The shipped locales are English and Russian. English is the default regardless
of browser locale. An explicit choice persists in
`localStorage` as `zarya.admin.language`; unavailable/invalid storage falls back
to English and does not prevent live switching. All interface text, accessible
names, document title/lang, notices and errors update without resetting forms,
selection or authentication. Storage contains only this preference, never
credentials, sessions or draft content.

Interface and content languages are independent. Site creation starts with en,
still using the established `languages: [language]` and `defaultLanguage`
contract. The initial form exposes one starting language; the backend supports
multiple enabled languages already. Page creation lists the site's enabled
languages and starts with its default. Home/Главная suggestions follow the
content language, never switch with the interface, and are blank for other
languages. Existing page language/content remain unchanged. Broader site i18n
is [proposed separately](multilingual-sites-proposal.md), not implemented here.

`test/integration/admin-i18n.integration.spec.ts` exercises the production bundle
in an explicitly configured Chromium browser with intercepted synthetic HTTP
fixtures. It starts no backend or database. It covers defaults with a Russian
browser, persisted/invalid/blocked preferences, live login/content errors, form
preservation, independent site/page language payloads and responsive selector
placement. This does not replace the real MongoDB/authentication suite below.

All native select controls share the global admin stylesheet: a vertically
centered SVG chevron with a consistent right inset and reserved text padding.
The language selector only adjusts its size. Native options, keyboard behavior,
labels and focus outlines remain browser controls; no custom dropdown runtime is
needed. Apply this style to future admin selects as well.

Locale metadata is registered in [the admin locale catalog](../../admin/src/i18n/catalog.ts).
Each locale has typed feature dictionaries under `admin/src/i18n/locales/<code>/`.
Use the feature's dictionary for labels, help, accessible names and error
messages. Use the common dictionary for text with shared meaning. Use named
placeholders for values that may move within a sentence. Keep long-lived
notices as message keys so the active locale can render them when it changes.

To add an interface locale, provide its dictionaries and register its language
tag, self-name and formatting metadata in the catalog. The selector uses this
registry automatically. Keep the same keys and named placeholders across
locales. The add-on SDK currently accepts English and Russian, so the registry
also declares which SDK language each interface locale uses.

## Administration source layout

| Directory under `admin/src` | Ownership |
| --- | --- |
| `app/` | Application shell, routing, authentication and build information. |
| `features/<feature>/` | Workspace, supporting components, API client, and models for a feature. |
| `shared/ui/` | Controls and reusable layout components used by multiple features. |
| `shared/api/`, `shared/browser/`, `shared/styles/` | Common request and content primitives, browser utilities, and theme styles. |
| `i18n/` | Locale registry, interface-language store, selector and message resources. |

Keep feature-specific state with its workspace. Promote controls or helpers
to `shared/` when multiple features use them for the same responsibility.
Keep the Vite entry point `main.ts` in the source root.

## Observable behavior

[ADR 0019](../adr/0019-admin-routing-and-single-page-publication.md) adds distinct
site-selection/workspace/page-editor routes. `/admin/sites` explicitly opens the
site list; `/admin/` resolves the last available site from the untrusted
`zarya_admin_site` cookie, otherwise the first available site or site creation.
Direct links, reload and Back/Forward preserve route context, and an
unauthenticated deep link resumes after login. Validate cookie IDs against the
authenticated site list; the cookie grants no authority.

After a successful empty site-list response, a recognized site/workspace deep
link also redirects to `/admin/sites/new`, replacing the obsolete history entry.
This applies after login and on an authenticated reload, including old add-on
routes from a reset installation. Clear an unavailable remembered site on any
route. A failed site-list request remains an error; it does not imply an empty
installation. With accessible sites present, a missing explicit site still shows
the unavailable view rather than silently opening another site.

The Pages drawer has a Hide system pages checkbox directly below its heading and
Create button, in the fixed header above its scroll pane. It defaults to false
and remembers the browser preference in localStorage under zarya.pages.hide-system.
Unavailable/blocked browser storage does not prevent filtering. The filter uses
the systemDocument role, hides the three crawler documents from the tree and move
choices, and leaves the current editor, ordinary pages, hierarchy expansion and
keyboard navigation intact. It does not change page data or publication.

Editor actions are Cancel, Save draft, primary Save & publish, in a non-scrolling
area above the form. Errors appear below the buttons in that same area. Tablet
and desktop navigation/actions share one toolbar row from 768px. Mobile page
actions also occupy one row, with 32-36px button heights, 12px labels and compact
button/toolbar padding below 576px. Full-site publication is hidden below 992px.
The template and public URL fields immediately follow the page title.
Cancel exits without saving. Save & publish first saves the draft, applies
the explicit template/initial path and activates a release for this page. The
first path suggests `/`; ZaryaBasic is an explicit basic-document choice.
Existing paths are read-only here, and unchanged template selection preserves
the complete saved rendering configuration. Publication settings apply when
publishing, not during Save draft. The toolbar offers full-site publication
separately to apply shared source changes to every published page.

An editor with page read, page publication options and publish permission can
publish an existing saved draft without update permission. The dedicated action
uses the assigned address and saved rendering configuration. If the action's
result is uncertain, the editor asks the user to reload and check the published
state before retrying.

If publication fails after draft saving, reread options for the acknowledged page
identity, including newly created pages. Preserve input and failure feedback;
distinguish an assigned URL from an active public route. If that read fails, show
the existing settings/unknown-state error instead of asserting the old URL is
absent. Reconciliation never repeats publication. See the
[partial-save regression](../defects/admin/new-page-partial-publication-state.md).

Under [ADR 0064](../adr/0064-page-tv-editing-and-conditional-tabs.md), page forms
show Main / Template variables tabs only for HTML templates with assigned TVs.
The ordinary main form has no tabs otherwise. TV fields have no surrounding
fieldset border or value-source selectors. Clearing uses a configured nonempty
default, announced below the input; without one the field stays empty. Both
panels stay mounted, errors remain visible, and native validation reveals Main
before focusing an invalid main field.

[ADR 0065](../adr/0065-tv-image-library-picker.md) adds the image TV's Choose image
or Replace button, preview and searchable image-library dialog. The dialog uses
lazy thumbnails and bounded rendered batches, and uploads new responsive images
through the existing Files API. Cancel preserves the field. A successful upload
selects its ready logical file and refreshes the media version without saving or
publishing the page. Shared CmsDialog keeps its original size unless a caller
explicitly requests the wider variant used by this library.

The TV form has no separate Refresh files button: the picker loads its catalog
when opened and propagates ready library changes. Image binding and alternative
text share a two-column row from 768px and stack below it. The page-editor scroll
pane reserves scrollbar space on both tabs, preventing horizontal movement when
only one panel overflows. Saving and publication stay in the page action bar.

On publication failure after saving, keep page identity, content and publication
settings and show a localized error. Do not report success from a draft response,
recreate the page on retry, or automatically replay a lost-response mutation.
Publication requests have a 120-second client timeout. Check the result after an
uncertain response before explicitly retrying.

Opening either frontend route first calls GET `/api/admin/auth/me`. A valid
session resumes the route or resolves the default workspace; 401 opens
`/admin/login`. Network/server failures show
a retry screen. Authentication opens site selection and the site workspace
described below. The frontend route alone grants no
server authorization; administrative APIs independently validate the cookie.

The login form sends email/password through POST `/api/admin/auth/login`, with
JSON, same-origin credentials and `X-Zarya-Admin: 1`. It supports native required
and email validation, password managers, password visibility, keyboard operation,
pending state, accessible errors and retry after network failure. Invalid
credentials use a generic message; 429 displays the server Retry-After rounded
up to minutes. Passwords are cleared after successful login. Raw server errors
and user-agent text are never inserted as HTML.

The backend owns persistent HttpOnly cookies. Browser storage contains no
credentials or tokens. Reload, tab visibility, window focus and browser history
navigation recheck the session. Starting login cancels an outstanding check so
a stale 401 cannot clear the new session cookie; late results cannot override
the newer login.
Revoked/expired sessions return to the login form. The authenticated header has a
44px square sign-out button immediately after the language selector, with a
localized accessible name and tooltip. It invokes the existing logout operation,
which revokes the current session and clears both scoped cookies. Successful
logout replaces the document with the login page, clearing in-memory editor state.
Unsaved changes use the existing leave warning before logout. Pending logout
blocks duplicate submissions; failures keep the workspace and allow an explicit
retry. Password recovery remains outside this frontend scope.

## Verification

Supported workspace URLs must work on direct navigation and browser reload through
the actual administration document server. Client-only navigation or a synthetic
HTML shell does not verify the server route allowlist, including the site-owned
`/admin/sites/:siteId/template-variables` workspace. Run the local minor-release
[administration gate](../cms-development/admin-release-tests.md) before minor releases.

Native validation from the mobile More menu closes the menu, reveals the field's
tab and transfers focus to the invalid control. A rejected save performs no write.
Ordinary menu dismissal retains its normal trigger-focus restoration.

Adapter unit tests cover reserved routes, host/method checks, HEAD, compiled
assets and private/missing/traversal targets. Settings tests cover the optional
root. `test/integration/admin-frontend.integration.spec.ts` uses the production
bundle, actual HTTP composition and an isolated migrated MongoDB database with
synthetic credentials. Build before running it. It covers invalid/successful
login, site selection, reload/browser session persistence, logout
invalidation, password visibility, keyboard navigation, loading failures,
temporary attempt restriction, cancellation of stale checks and the shared
responsive width matrix.

Run this suite and `admin-auth.integration.spec.ts` with explicit
`ZARYA_TEST_MONGO_URI` and `ZARYA_TEST_BROWSER_EXECUTABLE`. Chrome verification
does not establish iPhone Safari compatibility. No site deployment is implied.

## Site workspace REST contracts

Under [ADR 0016](../adr/0016-administration-site-workspace.md) and ADR 0019,
authentication resolves a site workspace by default. Explicit selection shows
site cards and a create button; no sites opens first-site creation. Creation
enters that site's workspace.
Site creation saves all entered fields and the origin choice in localStorage at
`zarya.admin.siteCreationDraft` as the user edits. Reloading restores this draft,
including incomplete input. Failed submissions preserve it; a successful creation
removes it before navigation. A new form then has empty fields and no origin
choice, except for the default development address `http://localhost:3000/`.
Malformed or unavailable storage does not prevent creation. This draft contains
no credentials and is local to the browser's CMS origin.
An empty tree shows only the square create control, which opens the first draft.
Keep this create control at the right end of the Pages heading row. The drawer
heading and footer remain outside the independently scrolling page tree. When
the tree scrolls down, show a shadow below the opaque heading; remove it at the
top. Reserve scrollbar space so overflow does not resize page entries.
Use the same horizontal padding and reserved scrollbar gutter for the heading
and tree, aligning the title and create button with the page-card edges.
Use `admin/src/shared/ui/CreateButton.svelte` for entity creation in Sites, Pages, Templates
and Chunks, and reuse it in future entity lists. It owns the accessible 44px square
button and centered SVG plus; callers supply the label, disabled state and action.
The first title suggests Home/Главная according to content language (blank for
others); it does not establish a root URL or publish.

The drawer displays one-level page entries because Page has no parent field.
The selected page opens an editor for title and Markdown content, persisted by
UpdatePage. Keys and languages are immutable after creation. Existing status,
rendering and publication data remain intact. The current site name/domain and a
return to all sites keep resource scope visible.

| Request | Body | Response |
| --- | --- | --- |
| GET /api/admin/sites | none | 200: items containing complete site state |
| POST /api/admin/sites | mark, name, primaryDomain, languages, defaultLanguage | 201: created site state |
| GET /api/admin/sites/:siteId | none | 200: site state or 404 |
| GET /api/admin/sites/:siteId/pages | none | 200: items containing pageId, siteId, mark, language, title, status |
| POST /api/admin/sites/:siteId/pages | mark, language, title, contentMd | 201: complete draft page state |
| GET /api/admin/sites/:siteId/pages/:pageId | none | 200: editable page state or 404 |
| POST /api/admin/sites/:siteId/pages/:pageId | title, contentMd | 200: acknowledged page state |
| GET /api/admin/sites/:siteId/publication | none | 200: registered template descriptors |
| GET /api/admin/sites/:siteId/pages/:pageId/publication | none | 200: owned page template/path options |
| POST /api/admin/sites/:siteId/pages/:pageId/publication | optional templateId/path | 200: published page and activated release |
| POST /api/admin/sites/:siteId/publish | empty object | 200: activated full-site release |

All endpoints require an active administrator session. Existing global
administrators access every site. Authorization is resolved once per request by
the request-owned access adapter; it never inherits local operator authority.
Mutations require the existing exact Origin, X-Zarya-Admin: 1 and JSON headers.
Unknown body/query fields and caller-supplied ownership/actor/publication data are
rejected. A route's site ID is checked by the existing scoped use cases. Missing
or foreign pages return 404, conflicts 409, malformed domain/fields 400, oversized
bodies 413, invalid content types 415 and unexpected internal failures a sanitized
500. Missing/stale authentication returns 401 and clears its cookie. Lists retain
all results from their existing ports; there is no silent client/server truncation.
A failed or timed-out write is not automatically replayed.

At 992px and above, the drawer occupies 286px and the editor takes the remaining
width, capped at the shared 1440px composition. Below 992px, each panel fills the
available area and a single transform moves both synchronously. Round chevrons
switch them, and page selection/create opens the editor. Inactive panels are
inert and aria-hidden; focus moves to the newly active switch control. Both
panels stay mounted, preserving form data on drawer switches. Independent inner
scroll regions keep controls and the drawer footer inside the viewport even with
a long form. Reduced motion disables the slide. Mutation controls prevent
navigation to another resource during an in-flight save. A workspace overlay
shows the saving loader; all editor actions remain disabled. Successful draft
save/publication shows its acknowledgement for one second and closes the editor
to `/admin/sites/:siteId`. Errors leave the editor open with input intact.
No browser storage holds
private page drafts or credentials.

Adapter tests cover authorization, input translation, body limits, error mapping
and cross-site denial using fake outbound ports. Composition tests resolve the
real use cases with provider overrides and assert absence of local authority.
Production-bundle browser tests with isolated MongoDB cover first-site creation,
multiple sites, draft creation/read/update across reloads, foreign-page denial,
responsive geometry, inert/focus behavior, preserved inputs and synchronized
animation. Chrome has been verified; iPhone Safari requires a separate device run.

## Current page availability

Under [ADR 0033](../adr/0033-page-url-and-public-availability.md), the page tree
uses current working URL bindings and active public routes rather than the
retained PUBLISHED lifecycle flag. Red means no assigned URL; green requires a
working URL and public page route; other/unknown states are gray with accessible
labels. Availability failures are explicit and can be refreshed.

The existing site/page publication-options GET includes pageAvailability:
`{ pageId, assignedPath: string|null, publicPath: string|null }[]`. Site results
contain pages with either binding/route; omitted pages have neither. A page
request includes its null-path entry when unbound. Redirects are excluded from
public page membership. The editor shows actual availability in its badge and
explains missing URLs below Public URL path, including pending activation when
an old route still serves the page. A new free path can be assigned by Save & publish.

For an existing page without a working URL, prefill its immediate Page parent's
assigned URL with a trailing slash. The site-level availability already loaded
for the drawer supplies this value; the page-specific options remain scoped to
that page. With no assigned parent URL, start at `/`. Explain the parent's prefix
below the field and the page's actual public availability separately. Preserve
manually entered paths when switching sections or refreshing routing. Prefilling
does not dirty the editor or assign/publish an address. The unchanged prefix of
an assigned parent cannot be published as the child's address; require a slug.

Selecting a folder in Pages, Files or URLs displays an overview above the editing
controls: direct-child counts and a navigable list with human-readable details.
Pages show child titles, working URLs and public availability. Files shows child
folders/files, MIME types and sizes inside the selected root/folder. URLs counts
page addresses, redirects and virtual folders separately, with page titles and
redirect status/destinations. Counts describe immediate children, not recursive
totals, and do not inherit drawer search/sitemap filters. Empty file/URL folders
are explicit. The overview derives from the current scoped catalogs and updates
after changes; opening a child uses the existing selection/navigation workflow.

General resource settings distinguish the live CMS process total from site-only
allocations. The total is decomposed into site, service (coordinator and
administration) and temporary dump processes, all sharing the displayed CPU
quota. Only rows with an assigned PID count as existing OS processes; pending
rows without a PID are shown separately. Live starting/draining replacements
remain counted. The site controls and summary explicitly refer to site processes,
so a single-process site with two service processes displays three CMS processes.

## Add-on workspace layout

Show the shared spinner and operation label over the affected card during a
CMS-managed add-on action. Show pending feedback on the separate install form,
in the catalog toolbar, or in the settings view when they own the operation.
Clear feedback after the result, including a failure, so retries stay visible.

Add-on administration follows the native workspace structure. Place the section
submenu in nav.cms-tabs, followed immediately by the drawer/editor layout. A
toolbar spanning both columns must not separate the tabs from the drawer. Put
the single h1 and workspace actions inside the editor column, beside the drawer;
keep creation controls at the top of the drawer. Preserve independent scrolling
and the shadow below each fixed heading.

Use the Pages document tree for hierarchical data and the Chunks list for flat
entities: reuse their public drawer/tree/row classes, disclosure versus selection,
focus, loading, scroll preservation and compact pagination. Add-ons consume the
public admin host/styles; they must not import CMS component source.

Forms use one column below 768px and two columns from 768px when related fields
fit comfortably in the available workspace. Pair fields only within one semantic
group. Keep long descriptions, notes and section headings full width; preserve
label/control adjacency and keyboard order. Use the existing mobile drawer/editor
transition and prevent overflow at tablet widths.

Action buttons reuse cms-primary/secondary/danger, cms-icon-button and cms-icon.
Add actions use the existing plus glyph; save actions use the floppy-disk glyph
from InstallationSettings/JSON-LD. Reuse native refresh/edit/delete glyphs for
equivalent actions. Icons are decorative (aria-hidden); keep visible action labels
or an accessible name for square buttons. Cancel actions have no icon.

An installed runtime opts into a menu count with the exact manifest route
`/api/admin/sites/:siteId/<addonKey>/menu-badge`. The authorized add-on list
advertises the capability. The runtime's authenticated GET returns
`{ "count": 0 }` with a non-negative integer and private, non-cacheable
headers. The runtime owns site authorization and count semantics. Only enabled
items already visible to the operator are queried. Zero hides the badge.
Counts refresh while the menu is visible and after an admin mutation through the
add-on workspace. Site changes discard any pending response for the old site.
The badge fits in the upper corner of its button. Its presence leaves the
vertical position and height of the site menu unchanged.

## Inline text actions

Text-only page actions use the shared green accent and dotted underline. The
cursor is a pointer; hover removes the underline without shifting the control.
Native summary controls inherit
this appearance, including scenario/site metric disclosures. Other inline actions
use button.cms-text-action with native keyboard, focus and disabled semantics.
