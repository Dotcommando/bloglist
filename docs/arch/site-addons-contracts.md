# Generic site add-on contracts

Date: 2026-10-28

The clean CMS contains the generic connection system under
[ADR 0036](../adr/0036-site-addons.md) and the distribution separation in
[ADR 0037](../adr/0037-clean-cms-and-site-installations.md). No business add-on
is installed. Both backend and admin component registries are empty. The
[add-on development guide](../addon-development/README.md) owns authoring instructions.

## Definitions and connections

IAddonDefinition is immutable trusted code metadata: addonKey, English/Russian
name and description, contractVersion, implementationVersion,
configurationSchemaVersion, adminComponentId and snippetIds. Contract version 1
is supported. A registration provides its configuration validator and migration
directory. Installing code is an explicit site-project package/build change or
repository release installation (below); enabling never downloads or evaluates code.

SiteAddon stores siteAddonId, trusted siteId, addonKey, Enabled/Disabled status,
configuration, optimistic version, UTC createdAt/updatedAt and createdBy/updatedBy.
The unique siteId/addonKey pair permits one connection of each add-on per site.
Identity/creation metadata survive re-enabling. Absent means never connected.
Keys match `^[a-z][a-z0-9-]{0,63}$`; page URLs and domains are independent.

Configuration is private JSON `{schemaVersion, values}`. A positive schema version,
finite JSON values, at most 1024 value nodes and depth 16 are required. Reserved
prototype keys reject. The add-on validates its entire configuration. Secrets
and process integration settings do not belong in public releases.

## Administrative REST operations

| Operation | Route | Additional input |
| --- | --- | --- |
| ListSiteAddons | GET /api/admin/sites/:siteId/addons | None |
| GetSiteAddon | GET /api/admin/sites/:siteId/addons/:addonKey | None |
| EnableSiteAddon | POST /api/admin/sites/:siteId/addons/:addonKey/enable | expectedVersion, configuration |
| ConfigureSiteAddon | POST /api/admin/sites/:siteId/addons/:addonKey/configuration | expectedVersion, configuration |
| DisableSiteAddon | POST /api/admin/sites/:siteId/addons/:addonKey/disable | expectedVersion |

Local AppModule offers the same inbound tokens under explicitly trusted operator
authority. HTTP obtains actorId from the authenticated active administrator and
checks site existence. SystemAdmin manages all sites, including archived sites.
SiteAdmin can manage connections on assigned sites under the
[administrative authorization contract](admin-authorization.md).
No network caller can supply trusted authority. Origin/Host/custom-header,
cookie, no-store and JSON-boundary rules follow the existing administration.
POST bodies are at most 16384 encoded UTF-8 bytes; unknown fields reject.

Successful operations return 200. Lists return complete sorted items containing
registered definitions and retained connection keys. HTTP summaries exclude
configuration, createdBy and private operation counters. Get returns the full
private connection and nullable definition. A registered but unconnected add-on
has connection null. Unknown keys without retained connections return 404.
The clean installation returns `{items: []}`.

First Enable requires expectedVersion null to assert absence atomically. Later
commands require the captured nonempty version. Enable/Configure replace the
whole validated configuration. Configure preserves lifecycle state. Equal checked
input is a guarded no-op without new business version/timestamps. Concurrent
insertion/stale input returns 409; reread after an unknown result.

Unregistered code cannot be enabled/configured. Enable/configure and enabled
startup validate runtime availability and package migrations. Missing prerequisites
return AddonUnavailable/503 or fail bootstrap before listeners. Disable remains
available for a retained connection even when its code is unavailable. Prerequisite
failures retain a private non-enumerable cause; unavailable storage is not diagnosed
as missing migrations without evidence. There is
no uninstall/delete API or button; destructive data policy remains deferred.

## Runtime and frontend extension contracts

AddonOperationService can issue a permit containing siteId, addonKey, access
class and connection version. PublicEnabled, AdministrationEnabled and
BackgroundEnabled require Enabled. AdministrationRetained permits a retained
connection under either status. The service does not replace actor permissions
or the add-on's own business rules.

The host's Mongoose transaction fence validates the captured connection and writes
its private operationGuard within the add-on's business transaction. A winning
disable/configuration invalidates older permits; a write that committed first
retains its acknowledged outcome. Database sessions stay in technical adapters.
No business capability or concrete policy instance is registered by the clean CMS.

The generic admin section lists available/retained connections and enables or
disables them. It loads trusted registered components lazily. IAddonAdminHost
provides site identity, language, enabled state, page summaries and a site-scoped
request function with optional idempotency key. The host includes
`systemDocument` in each page summary. It is null for regular pages and
identifies the sitemap, robots or llms document for system pages. Add-ons can
use this metadata to select pages appropriate for a form. An empty registry
shows an explicit English/Russian empty state and does not import a component
package.

Installing an add-on does not itself install site templates or Snippets. Site
projects adopt such content through normal rendering operations. Live connection
state does not rewrite immutable releases; APIs independently enforce current
availability. Content rollback never rolls back connection or business data.

## Persistence and verification

The core schema baseline creates site_addons with strict validators, unique site/key
and status/site indexes. Automatic index/schema creation remains disabled. The
checksum-verifying migration runner supports optional owner-scoped directories
and separate addon_<owner>_migrations receipt collections. The clean registry has
no such directories. Historical business schemas are consolidated only in the site
project's baseline under [ADR 0039](../adr/0039-pre-release-schema-baseline.md);
the clean core uses its own fresh database and does not adopt site receipts.

Fake-port tests retain generic lifecycle, authorization, unavailable registration,
version and site-scope coverage. Composition tests resolve the generic operations
with no optional package. Distribution regressions reject business package imports,
business schema baselines and installed site content. Isolated MongoDB/browser
coverage verifies the empty catalogue, no booking collections/routes, retained
unavailable metadata and the bilingual admin empty state. Related core publication
and media tests verify those workflows without an optional integration.

## Navigation and theme (ADR 0038)

Trusted definitions may provide adminMenu {en, ru}. Site configuration may contain
adminMenuLabels {en?, ru?}; only these reserved labels accompany catalogue summaries.
The host offers timeZone, location, navigate, configure, setDirty, setBusy and the
shared scrollShadow action in addition to the existing scoped request/page context.
Settings and working screens share the component route with query-based view state.
An unbound screen has no shortcut in the site menu. The Add-ons catalog tells
the site administrator that the developer has yet to configure screen access.
An administrator can still open the connected component from Settings. A
delegated catalog grant leaves the catalog readable. Runtime view metadata and
asset bytes for an unbound screen require the administrator grant. A connected
add-on with bound screens appears when the actor has the Actions for an available
view. The same view grants govern direct links and its assets, and the menu's
unread count uses its own Action. See the [host and SDK authorization contract](../addon-development/authorization.md).
Components use CMS-owned cms-primary/secondary/danger, cms-card, cms-row, cms-tabs,
cms-tab, cms-callout and form styles plus --cms-* palette variables.
Site Settings owns its timeZone and optimistic expectedTimeZone guard independently
of addresses; it does not modify add-on data. UTC is the default.

## Repository release installation

See [ADR 0052](../adr/0052-repository-addon-installation.md). The source URL is a
HTTPS GitHub repository root, optionally ending in .git or a trailing slash.
Canonical repository identities are lowercase. Credentials, custom ports,
queries, fragments, branch/file URLs and other Git providers reject explicitly.
The latest stable published release must contain exactly one uploaded asset
named addon.runtime.gz; draft/prerelease/source-only repositories cannot install.

Public repositories use anonymous GitHub requests. For private repositories, an
installation can configure a GitHub App Client ID and a private PEM directory.
The delivery adapter resolves the App installation for the exact requested
repository and obtains an installation token scoped to that repository with
`Contents: read`. Both repository installation and the card check use it for
release metadata, the commit and the first asset request on `api.github.com`.
Asset redirects carry no authorization header. The private directory is reread
when authenticating. A newly copied valid PEM can be used at the next check
without a fixed filename or restart. See the [configuration guide](../installation/en/INSTALLATION.md#private-github-add-on-repositories).

GET and POST /api/admin/sites/:siteId/addon-installations use the existing current
administrator, origin/custom-header and no-store boundary. POST accepts
{repositoryUrl, installedAddonKey?}; authenticate before reading the 8192-byte body. Both operations
check the initiating site's existence and actor access. POST returns 200 with the
installed metadata; GET returns the complete global {items} list. Actor identifiers
are excluded from HTTP summaries. Existing site connections/configuration survive
unchanged and are never enabled by installation.

The card's Connect GitHub action supplies installedAddonKey. It verifies the
release and requires its add-on key and runtime digest to match active code before
claiming the repository. An exact match records the source without installing
code or changing site connections. A mismatch returns 409 without claiming it.

Global addon_installations stores opaque identity, canonical repository URL,
release tag, resolved source commit, archive checksum, runtime manifest digest,
add-on key/implementation version, actual host cmsVersion, Pending/Installed state,
UTC creation/completion instants and the initiating administrator. Unique indexes
claim repositoryUrl and addonKey. The collection has Global dump role and does
not enter site/category archives or expose business data.

A Pending record is reserved after archive/manifest/ownership/dependency validation
and before code evaluation or owned schema installation. Installed is acknowledged
only after activation. A failed activation or unknown acknowledgement retains the
immutable claim. An explicit retry resolves the saved release tag and requires the
same source/commit/archive/runtime identity. An identical active Installed request
returns without a network call. A Pending acknowledgement is also completed without
a download when the registry already verifies the same active digest. Different artifacts/versions/sources reject with
409; this operation has no update, uninstall or automatic background retry.

The release archive is gzip JSONL, using the existing streamed file record
framing: {kind: addonPackage, format: zarya-addon-archive, version: 1}, followed
only by package-area directory/file/chunk/fileEnd records and the checked end
record. It contains a normal prebuilt addon.runtime.json, CommonJS server,
optional browser/CSS files and migrations/0000-runtime.json. It contains no site
data or package-manager scripts. Symlinks, traversal, duplicate/case-colliding
paths, undeclared files, mixed records, truncated streams and checksum mismatches
reject before evaluation. Transport/expansion limits are in transport-limits.md.

Runtime manifests may declare a minimum cmsVersion; repository releases must
declare one. The builder uses the registration's optional minimumCmsVersion, or
its host version when omitted. Such declarations
are also checked during startup/import validation. Verify the minimum against
the current host version. See ADR 0056.

Installation accepts the prebuilt runtime archive and runs no npm, compiler,
Git clone or server restart. See [build and publish](../addon-development/runtime-packages.md#build-and-publish)
for the author's packaging procedure.

Missing repositories/releases return 404; invalid URLs/assets/CMS declarations
return 400; conflicts return 409; upstream/network or runtime availability failures
return 503. Other invalid package checks retain the runtime installer's existing
failure translation. Errors carry no downloaded server output or credentials.
A failed request can be retried; the administration shows retained Pending claims.
Private staging is cleaned after normal success/failure. Process-kill leftovers
remain private and are not activated as packages. Failed removal retains code-owned
cleanup state, retried before the next preparation downloads more code. A secondary
disposal error does not replace the primary activation/reservation failure.

Focused fake-port, delivery/archive, metadata translation, HTTP authentication,
composition and isolated MongoDB/browser regressions cover installation,
idempotent retry, immutable conflicts, global catalogue/site enablement separation,
dump exclusion, responsive forms, bilingual labels and bootstrap from saved files.

## Live runtime updates (0.15.0)

Updates use the separate [live update workflow](live-addon-updates.md). The initial
repository-install claim stays immutable. Updates within a major version retain
the baseline bytes and append owned migrations. Major updates declare one
new baseline with the [superseded migration history](live-addon-updates.md#package-contract).
During an exclusive update, operation
authorization rejects the paused add-on, including retained administration; the
connection's Enabled/Disabled preference and configuration survive unchanged.
The coordinator reads manifests but evaluates no installed add-on code.

## Administration presentation

See the [administration workspace layout](admin-frontend.md#add-on-workspace-layout)
for the host's presentation contract and the [add-on code standards](../addon-development/code-standards.md#administration-and-browser-code)
for authoring guidance.
