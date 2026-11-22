# Document MIME types and crawler files

See [ADR 0049](../adr/0049-document-mime-types-and-crawler-files.md).

CreatePage/UpdatePage accept optional mimeType and excludeFromSitemap.
Omission defaults a new page to text/html and false; update omission preserves
the saved value. MIME is lowercase type/subtype, at most 255 ASCII characters,
without parameters. The editor obtains its preset list from publication options
and accepts a custom type. Raw bodies remain literal UTF-8 text, including empty
bodies, without Markdown, MODX, Snippet, template or asset processing. Existing
HTML rendering configuration can remain dormant while the page is raw.

MIME and explicit exclusion are retained page content. Restoration changes their
draft values with the rest of the selected version and leaves URLs and the active
release alone. Publication emits X-Robots-Tag: noindex when robotsIndex is false,
including raw and Request documents. Node delivery, authenticated/loopback preview
and prepared Cloudflare output preserve explicit MIME; text/* uses UTF-8.

## New site setup

Before completing CreateSite, establish exactly three published root pages and
fixed PAGE URLs: sitemap.xml (application/xml, sortOrder 100), robots.txt
(text/plain, 200), llms.txt (text/plain, 300). They receive normal opaque IDs,
site-scoped keys sitemapXml/robotsTxt/llmsTxt and immutable page numbers 1/2/3. The next ordinary root
page's default sortOrder is 400; the first ordinary page still suggests /.

One site-content transaction stores pages, retained versions and URLs, guarded
against concurrent creation. A partial unique site/role index prevents duplicate
system identities. Setup then stages and activates initial-<siteId>, containing
only the three documents, before committing its completion marker/event.
An activation receipt reconciles a lost acknowledgement. Repeating the same
CreateSite input for a matching Pending site resumes setup; completed sites or
different input remain conflicts. No failed setup silently acknowledges success.

No origin means an empty public sitemap and no Sitemap directive in robots.
With an origin, robots points to the selected absolute sitemap URL. It initially
denies /admin and /api/admin and their subpaths, permitting other crawling.
llms starts empty. No home page, business add-on or existing-site backfill is
created.

System roles, MIME, root position and URLs cannot be changed through ordinary
operations. sitemap content is generated and read-only; its editor reads the
selected active artifact via publication options. robots and llms retain manual
content editing and explicit publication. No per-page robots flags, automatic
rule insertion, line-authorship ledger or mismatch SnackBar exists.

## Publication and sitemap

Every new content route freezes robotsIndex, explicit exclusion, MIME and optional
system role in its release metadata. A page release retains other routes' frozen
values and the published robots artifact; their current drafts do not affect it.
Publishing robots recomputes sitemap for all active content routes in the same
activation. Routing-only releases retain MIME/content/preferences, relocate raw
files with their routes and recompute the map without modifying robots.

Eligibility requires a direct active page route, allowed indexing, no explicit
exclusion and no effective robots prohibition. System documents and redirects are
excluded. Removing a prohibition restores otherwise eligible entries without
changing stored indexing/exclusion preferences. Unknown legacy route preferences
retain the previous sitemap's membership rather than adopting drafts.

The robots-parser adapter evaluates wildcard and explicit user-agent groups,
longest rules, Allow ties, wildcard paths and encoded URLs. A prohibition for
any declared group excludes the canonical route path from the shared sitemap.
Diagnostics identify the restricting group, rule and line. A missing robots file
is shown explicitly; a failed read is not treated as permission to crawl.
The editor distinguishes published diagnostics from unsaved/draft preferences.
Manual origin/path changes do not rewrite literal robots rules or directives.

XML generation uses structured serialization, absolute URLs and escaping.
The final XML includes a text/css xml-stylesheet instruction. Its content-hashed
CSS is bundled in the same release, including empty maps, with release-qualified
URLs for incremental/routing releases and the standard asset base for initial
builds. Static release export preserves the asset and rewrite. Native browser
XSLT is not required. The editor parses active XML into escaped, clickable HTTP(S)
URL rows, with explicit loading/error/empty states and batches of 100. It does
not fetch or execute XML processing instructions or render authored HTML.
Updating existing public presentation requires a new release, not a migration.
Existing limits remain 50,000 URLs / 50 MiB. Robots parsing is bounded to 1 MiB
of actual UTF-8 input. Raw file paths cannot collide with directories or reserved
manifest, content, plan and hosting-control files. Immutable releases activate
through the existing compare-and-swap and receipt contracts.

Migration 0002 expands optional validators for working/retained content and
release metadata and adds the system-role index. Legacy absent fields read with
documented defaults and remain usable in captured-state comparisons. Apply the
migration explicitly before starting the updated application; it neither
provisions existing sites nor changes retained artifacts.

Archive and move use the same default-equivalent captured-state comparisons as
repository saves and publication: absent MIME/exclusion values match text/html
and false. This does not permit an actual intervening content change; it remains
a conflict. See the [regression record](../defects/pages/optional-document-default-guards.md).
