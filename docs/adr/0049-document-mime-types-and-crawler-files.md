# ADR 0049: Document MIME types and root crawler files

Date: 2026-11-01

Status: Accepted for the decisions explicitly recorded below through the owner's
request and follow-up answers. Open policies are identified separately and are
not implementation authorization. The owner subsequently authorized implementing
the agreed document, publication and administration behavior.

## Context at design time

Documents currently have Markdown content and HTML rendering configuration but
no document MIME field. PageType describes a separate classification, not an HTTP
media type. Publication builds HTML, maps static routes to index.html artifacts,
and requires text/html for static documents. Both preview adapters require HTML;
PublishCurrentPage requires a template. Changing only an HTTP header is therefore
insufficient.

The CMS already generates sitemap.xml as an immutable release artifact. It is
not a page in the administration tree. Full publication uses published routes
and frozen robotsIndex; incremental publication preserves unchanged membership,
and routing releases move that membership with the routes. The public controller
special-cases /sitemap.xml. The build reserves that path against ordinary routes.

robotsIndex currently controls the HTML SEO view model's index/noindex value and
sitemap eligibility. It does not maintain robots.txt. The shared SnackBar supports
timed notifications but currently has no close button or warning variant.

References: [ADR 0023](0023-page-slugs-and-seo-fields.md),
[ADR 0025](0025-page-tree-order-and-numbered-links.md),
[ADR 0028](0028-url-workspace-and-site-addresses.md),
[ADR 0029](0029-immediate-url-changes-and-address-removal.md),
[ADR 0033](0033-page-url-and-public-availability.md),
[ADR 0035](0035-site-onboarding-and-selected-origin.md).

## Accepted decisions

Subsequent decision: [ADR 0053](0053-markdown-representations-and-editor-preview.md)
adds negotiated Markdown representations of composed HTML pages and a split
editor preview action for CMS 0.10.0, explicitly outside 0.8.0. It does not change
the literal non-HTML document behavior defined here.

### Document MIME and source

The page editor offers a code-owned constant of frequently used MIME types and
a custom value. text/html is the default. A custom type is not restricted to the
preset list. The initial preset list is recorded below.

Non-HTML documents contain literal text, without Markdown-to-HTML conversion,
template execution, Snippet or MODX substitutions, or injected HTML/CSS/JS. For
example, XML remains XML and llms.txt Markdown remains text. An empty body is a
valid document. This is text document authoring; setting a MIME does not convert
text into PDF, an image, or another binary format.

The MIME belongs to the saved draft and its published version. Draft saving
does not change the public Content-Type or body. Publication, retained versions,
restoration, preview, incremental releases and static export must preserve the
selected version's MIME and content. Existing HTML authoring retains its current
rendering behavior. These requirements extend the publication contracts rather
than overloading PageType.

Use the standard spelling text/plain, correcting the request's plain/text.
RFC 9309 explicitly requires that type and UTF-8 for robots.txt:
[RFC 9309 section 2.3](https://www.rfc-editor.org/rfc/rfc9309.html#section-2.3).
llms.txt uses text/plain for this feature. Its contents may later follow the
[llms.txt Markdown proposal](https://llmstxt.org/); the owner's initial empty
document is a placeholder, not a claim of conformance to its required heading.

### Initial root documents and protection

Site creation provisions three site-owned documents before the administrator
reaches the completed site's root:

| Document / fixed URL | Initial sortOrder | MIME | Initial body | Editing |
| --- | --- | --- | --- | --- |
| sitemap.xml / /sitemap.xml | 100 | application/xml | XML declaration and empty namespace-qualified urlset | Generated; always read-only in administration |
| robots.txt / /robots.txt | 200 | text/plain | All user agents may crawl except administration; sitemap location included | Ordinary text content editing |
| llms.txt / /llms.txt | 300 | text/plain | Empty | Ordinary text content editing |

All three stay at the site root with fixed URLs. They cannot be deleted, moved,
renamed to another URL, or replaced by a redirect through ordinary administration.
The sitemap has its own generation rules. Its source and MIME cannot be manually
changed through the editor. Generic documents do not gain system behavior merely
from a matching title or MIME.

The initial robots content denies the actual administrative entry paths and
otherwise permits crawling. Include Sitemap: followed by the selected site's
absolute sitemap URL. The directive is supported by the
[Sitemap protocol](https://www.sitemaps.org/protocol.html#submit_robots);
it must not be inferred from an arbitrary administration Host header.
Origin selection follows ADR 0035, including the configured local origin and port
when selected. Missing origins and subsequent manual changes are addressed below.

Site setup creates and activates an initial immutable release containing only
these three documents. All three public URLs are available immediately after
successful site creation, before any ordinary page is published. Failed initial
activation must not be acknowledged as completed setup; retry/recovery must not
duplicate documents or publish unrelated content.

[ADR 0050](0050-site-scoped-page-keys.md) subsequently assigns the readable,
site-scoped page keys sitemapXml, robotsTxt and llmsTxt to new system documents.

These are generic CMS documents, not business add-ons or site-specific sample
content. They do not populate business registries or create a home page.

### Readable sitemap presentation

In the owner's follow-up, the public sitemap and its read-only Content field
receive a readable presentation. Keep application/xml and the standard sitemap
namespace and URL membership. Generated XML links a bundled, content-hashed CSS
stylesheet through an xml-stylesheet processing instruction. The stylesheet is a
public artifact of the same immutable release; page and routing releases update
its reference together with the XML. Static export includes the stylesheet and
the existing release-asset rewrite. Even an empty sitemap is styled.

Use CSS rather than browser XSLT: Chrome plans to remove native XSLT in version
158 on November 17, 2026, while XML + CSS remains supported
([Chrome documentation](https://developer.chrome.com/docs/web-platform/deprecating-xslt)).
Do not add an XSLT dependency or script/polyfill to the public XML.

The administration renders the active XML as a numbered list of clickable HTTP(S)
URLs in the Content field, retaining read-only behavior. Parse XML structurally
and render escaped text through Svelte; do not execute processing instructions,
stylesheet references or embedded markup from the document. Missing or invalid
data shows an explicit error; an empty valid sitemap has a separate empty state.
Large lists show their total and offer further batches of 100 entries, without
dropping URLs. This is view pagination, not a transport or sitemap limit change.
Presentation changes require republication of retained artifacts, not a schema
migration.

### Ordering and the first ordinary page

The existing nextPageOrder policy computes max sibling sortOrder + 100,
starting at 100 per parent. The Mongoose creation adapter applies it under the
existing site transaction when sortOrder is omitted. With the three root
documents at 100/200/300, the first ordinary root page therefore receives 400
without a new numbering policy.

This is sortOrder, not pageNumber. pageNumber remains an independent immutable
per-site sequence from 1. Explicit caller-supplied order, another parent, prior
reordering and concurrent successful creations affect the result; 400 is the
default for the initial ordinary root creation, not a universal reserved ID.

The administration currently passes first = pages.length === 0 to its URL
suggestion. After provisioning, it must ignore the three system documents when
identifying the first ordinary home page; that page still receives the initial
suggestion /. The page and URL trees remain separate.

### Search indexing and sitemap lifecycle

A new unpublished draft never appears in the public sitemap. Publishing a page
updates the sitemap in the same activated release. Full-site and single-page
publication retain their existing distinct purposes. Relevant applied routing
changes also update sitemap paths/removals while preserving published content.
Saving a new draft, editing an existing draft, or restoring a version into the
draft does not publish content or expose its draft URL/metadata in sitemap.

The primary page setting is Allow search indexing, enabled by default and based
on the existing robotsIndex concern. Disabling it publishes noindex and excludes
the URL from sitemap; it does not automatically add a robots.txt prohibition.
Use X-Robots-Tag: noindex for document responses, including non-HTML MIME types,
with equivalent behavior in public delivery and static deployment. A crawler must
be able to retrieve the document to observe this instruction:
[Google's noindex guidance](https://developers.google.com/search/docs/crawling-indexing/block-indexing).
Allowing indexing does not promise that a search engine will index the page.

Sitemap membership is computed, not a stored Include in sitemap checkbox. Add an
advanced Exclude from sitemap checkbox, disabled by default, for an administrator
who wants a crawlable, indexable page omitted from the map. The inspected editor
currently has no separate sitemap checkbox; this adds the explicit exclusion.
A URL is eligible only when it directly serves a page in the active release,
indexing is allowed, effective robots rules permit crawling and explicit exclusion
is off. Redirects, synthetic URL folders and all three protected system documents
are excluded.

A robots prohibition excludes the covered page URLs, including nested URLs under
a folder rule. It does not modify their indexing preference or explicit sitemap
exclusion. Removing that prohibition restores sitemap membership automatically
when the other eligibility conditions hold. This supersedes the earlier decision
to clear a stored Include in sitemap flag when robots closes a URL; no flag-history
or remembered pre-prohibition value is required.

Changes reach the public sitemap with the release that activates the changed
page, routing or robots content. Publishing robots recalculates membership for
all affected active page routes, not just the robots document. Draft-only edits
do not change the active public sitemap. Unchanged pages retain frozen published
preferences; unrelated draft edits remain unpublished. Show computed membership
and its reason in the editor, for example, Excluded: crawling is blocked by
/private/. When previewing a draft, distinguish that projected result from the
active release's public result.

The generated body must reflect the selected release, not an asynchronous
best-effort rewrite of a separate public file. A failed build or activation must
not expose a sitemap for unactivated content. Empty initial content must not
invent a / entry. Reuse structured XML serialization and escaped absolute URLs.
The existing 50,000 URL / 50 MiB limits remain; exceeding a limit fails rather
than silently truncating. A sitemap index is outside this request.
See the [Sitemap protocol](https://www.sitemaps.org/protocol.html).

The owner separately described a future withdrawal operation: offer a choice for
the related URL, defaulting to a redirect to the first nonvirtual ancestor URL
folder, or / for a root page, and update sitemap accordingly. That operation and
its redirect choices are deferred. Saving a draft of a previously published page
does not constitute withdrawal from the active release.

### Manual robots.txt editing and page diagnostics

robots.txt is created during site setup with the agreed default content and
included in the initial release. Thereafter its body is edited manually as an
ordinary text document, with draft saving and explicit publication. Advanced
robots management means editing this file; it is not an additional page-editor
action that rewrites the file.

There are no per-page robots prohibition checkboxes, stored requested robots
flags, automatic Disallow insertion/removal, line-authorship tracking or automatic
Allow exceptions. Page creation, publication, indexing settings and URL changes
do not rewrite robots.txt. An administrator who wants an exception to a folder
prohibition edits the applicable Allow/Disallow rules manually.

This supersedes the earlier page/subtree checkbox and automatic rule-synchronization
decisions in this conversation, including merging automatic rules into a robots
draft and the five-second mismatch warning after manual rule removal. Those
behaviors are outside the accepted implementation scope. Normal editor feedback
may use shared notifications, but this task no longer requires that mismatch
SnackBar or changes to its close-button behavior.

The editor shows the effective influence of published robots rules on the page's
URL, including a direct prohibition or coverage by an ancestor folder/pattern.
URL ancestry is distinct from the page tree. Show the applicable group/rule and
the resulting sitemap inclusion reason; bot-specific results must not be reduced
to an inaccurate universal Allowed/Blocked label. No assigned URL, missing robots,
a failed check and draft-only rules need explicit states. A robots draft may be
inspected as a projected result, separately from the active public result.

Use a structured rules parser and effective matching, not a literal search for
Disallow. Account for specific user-agent groups, path specificity, Allow ties,
wildcards and encoded paths:
[RFC 9309 section 2.2](https://www.rfc-editor.org/rfc/rfc9309.html#section-2.2).

Publishing a page uses the selected active robots content for sitemap eligibility
and preserves any unpublished robots draft. Publishing robots activates its new
content and the recomputed sitemap for all affected active page URLs together,
while retaining unrelated published content and leaving unrelated drafts alone.
Saving a robots draft never changes the public sitemap. Concurrent publications
or manual edits retain the existing captured-state and activation protections.

robots.txt controls crawling, not authorization or a guarantee of removal from
search results. Keep robotsIndex/noindex as a separate concern. A crawler denied
access may never read the page's noindex directive:
[Google Search Central](https://developers.google.com/search/docs/crawling-indexing/robots/intro).

## Resolved policies and deferred work

The owner resolved the implementation choices below while authorizing the work.
Existing-site recreation/provisioning and withdrawal remain outside this task.

| Case | Recommendation / question |
| --- | --- |
| Rule diagnostics | Cover / and query variants, slash differences, literal * and $, percent encoding, case and path prefixes such as /docs versus /docs-other. Explain direct/folder/pattern coverage without inferring it from Page.parentPageId. |
| Bot-specific sitemap eligibility | Exclude a URL if any declared user-agent group or the wildcard group effectively prohibits it. Show the restricting group and matching rule. No bot-specific sitemap variants are introduced. |
| MIME changes | Publishing a new MIME replaces that page's artifact in the next release. Preserve dormant HTML rendering configuration, but do not execute it or validate its required TV fields for raw publication/preview. Switching back requires valid HTML rendering configuration. Old releases stay readable. |
| System-file settings | All three are excluded from sitemap and the published page catalog used by navigation/Snippets. Their roles, root position, URLs and MIME remain fixed. sitemap is read-only; robots/llms retain ordinary title/order/content editing. System documents cannot contain child pages. |
| No configured origin | Create the public empty sitemap and omit the robots Sitemap directive. Do not invent a domain or scheme. This choice was explicitly accepted by the owner. |
| Origin/domain changes | Regenerate sitemap on the next relevant activation. robots remains manually authored after initial provisioning; administrators update its Sitemap directives themselves. Old immutable releases remain unchanged. A dedicated stale-directive diagnostic is outside this task. |
| Languages and identity | Create one document per role per site in the site's initial default language. Preserve its immutable language/identity under the existing page rules. Changing that language is not a new workflow in this task. |
| Existing installations and restore | No backfill or recreation of katerina-bloom is authorized. Existing pages default to text/html and no explicit sitemap exclusion; old releases remain readable. Dumps retain stored role/MIME values under their existing schema-compatibility checks. The site-scoped unique role index rejects duplicates. |

Preset constant: text/html, text/plain, text/markdown, text/css,
text/javascript, application/json, application/xml, application/rss+xml,
application/atom+xml, image/svg+xml. This is a convenience list, not a restriction
on valid custom media types or permission to execute authored code.

Store a normalized lowercase type/subtype with a maximum length of 255 ASCII
characters, without parameters. The code validates the accepted token grammar;
text bodies use UTF-8. Reject malformed input and header controls without a
text/html fallback. Existing records without a MIME read as text/html.

Raw file URLs produce exact file artifacts such as robots.txt and feed.xml.
A slash-terminated raw route uses index.txt within that directory, including the
root; the deployment route map preserves the public URL and explicit MIME.
Preserve literal source and empty bodies. Reject file-versus-directory conflicts
and reserved internal artifact paths before staging output.
A filename extension must not override an explicit custom MIME. HTTP preview,
Node public GET/HEAD and the Cloudflare/static deployment output must convey the
same Content-Type; static hosting cannot rely only on extension guessing.
Keep active content such as SVG/JavaScript previews inside the existing trusted
preview boundary rather than interpreting raw text inside administration DOM.

## Architecture and acceptance boundaries for implementation

The owning application operations orchestrate site provisioning, publication and
sitemap recomputation through explicit ports. Domain policies own protected roles,
flags and invariants; controllers translate results. Do not put these workflows
in HTTP handlers, frontend callbacks or an optional user hook. Ordinary API,
local, hook and system-object mutation paths must enforce the same protections.

Provisioning must be idempotent per site and role, reserve identities and paths
without duplicates, and finish before acknowledging completed site setup. Preserve
the setup/event contract of [ADR 0043](0043-cms-hooks-and-durable-handlers.md).
Specify transactional database writes and publication/filesystem failure recovery
before extending the existing setup port. Never acknowledge successful setup with
silently missing system files.

Versioned schema changes must cover drafts, retained page content, publication
metadata and dump compatibility. No database reset, modification of applied
migration checksums, or automatic rewrite of historical releases is authorized.
Sitemap regeneration must not recursively publish itself. Concurrent publications,
robots editing and failed/lost activation acknowledgements retain the current
compare-and-swap and receipt semantics. An unsaved browser robots buffer must be
preserved and treated as potentially stale after concurrent manual changes.

Required focused verification for implementation:

- Completed new site has exactly three protected root documents and an activated
  initial release serving all three with no ordinary home page. Retry/fault and
  concurrent creation do not duplicate roles or paths. First ordinary root order
  is 400 and its suggested home URL is /.
- HTML compatibility plus literal raw XML/JSON/Markdown, custom MIME, malformed
  MIME rejection, empty llms body, matching preview/GET/HEAD/static-export headers,
  raw file paths and artifact/route collision failures.
- Draft save versus page/full/routing publication; immutable sitemap consistency,
  exclusions, redirects, unknown origin, XML escaping and existing size/count limits.
- Effective robots diagnostics for exact/folder/pattern rules, root scope,
  distinct page/URL trees, user-agent groups, overriding Allow and encoded/query
  paths. Manual rule edits are preserved without automatic insertion or removal.
- Publishing a robots draft recalculates all affected active sitemap entries;
  saving only its draft does not. Blocking and reopening leave indexing and
  explicit sitemap-exclusion preferences intact; eligible reopened URLs return
  automatically. Protected system documents remain excluded.
- Disabling indexing emits noindex for HTML and non-HTML public responses and
  static deployment without changing robots. Explicit sitemap exclusion alone
  does not prohibit crawling or indexing. Editor membership reasons distinguish
  noindex, robots prohibition, explicit exclusion and missing publication/URL.
- Publishing another page preserves robots bytes and its unpublished draft;
  concurrent manual writes and activations conflict safely. No removed per-page
  robots controls or automatic-rule mismatch SnackBar is introduced.
- Editor direct/inherited prohibition diagnostics, draft versus active rules and
  load failures; cross-site isolation, protected mutation through all entry
  points, version/dump restoration and existing-site path conflicts.

Implementation uses migration 0002-document-mime-and-crawler-files for optional
page/version fields, frozen route metadata and a partial unique (siteId,
systemDocument) index. It does not rewrite applied migrations or old releases.
Initial documents/retained content/URLs commit atomically under the site content
guard. A deterministic initial release ID, activation receipts and resuming the
same Pending CreateSite input permit recovery without duplicate documents or
replaying completed setup events. Initial output is staged/activated before the
setup completion marker/event commits. No owner database migration, existing-site
recreation or deployment is performed by implementing this feature.

The implemented contracts are in [document MIME and crawler files](../arch/document-mime-and-crawler-files.md).
