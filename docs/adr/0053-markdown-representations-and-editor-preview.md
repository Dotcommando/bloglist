# ADR 0053: Markdown page representations and editor preview

Date: 2026-11-02

Status: Accepted through the owner's Markdown discussion and explicit editor
interaction request. Implemented in CMS 0.10.0; excluded from CMS 0.8.0.
Implementation contracts and upgrade requirements are recorded in
[Markdown and JSON-LD publication](../arch/markdown-and-json-ld.md).

Scheduling amendment, 2026-11-02: the owner authorized reserving CMS 0.9.0 for
deployment and installation improvements and moving the GEO capabilities to
0.10.0. See [ADR 0055](0055-provider-independent-deployment-and-installation.md).
The behavior and acceptance requirements below remain unchanged.

## Context

An HTML page's main content is stored as contentMd, but that field is only part
of the resulting document. Templates, chunks, template variables (TVs), Snippets
and their resolved data can contribute substantial content. Returning contentMd
alone would omit that content. The current renderer does not provide a common
semantic document tree covering the complete composition.

[ADR 0049](0049-document-mime-types-and-crawler-files.md) supports literal
documents with an explicit MIME type, including text/markdown. An alternative
Markdown representation of an HTML page is a separate capability: it does not
change the page's authored MIME type or require a second manually maintained
document.

References: [TVs](0040-template-variables.md),
[publication](0007-simple-page-publication-and-releases.md),
[public delivery](0008-public-delivery-and-page-restoration.md),
[current public availability](0033-page-url-and-public-availability.md), and
[protected previews](../arch/rendering-element-editing.md).

## Decision

### One composed page, two representations

CMS 0.10.0 adds Markdown as an alternative representation of published HTML pages
at their existing public URLs. A request expressing a preference for
Accept: text/markdown receives Content-Type: text/markdown; charset=utf-8.
Honor media-range quality values; ordinary browser requests retain HTML delivery.
Use Vary: Accept for negotiated responses, representation-specific validators
and corresponding GET/HEAD and conditional-request behavior. Redirects retain
their existing semantics.

Generate Markdown from the complete server-rendered HTML after resolving the
page's template, chunks, TV values and Snippet results. Preserve meaningful
headings, paragraphs, lists, tables, links and image alternatives. Exclude
scripts, styles and non-content document scaffolding. No browser JavaScript
execution is required. Use one conversion policy for public delivery and editor
preview rather than a separate simplified contentMd preview.

For static pages, prepare the Markdown artifact during publication alongside
HTML in the same immutable release. For Request pages, convert the HTML produced
by the selected saved Request plan using the same resolved request data. Do not
execute loaders a second time just to produce Markdown. Preserve frozen Build
values and prebuilt assets; public requests do not compile assets or rerun Build
loaders. Request representations retain no-store caching.

Select one activated release per public request and keep site/release ownership,
publication visibility, noindex behavior and failure semantics intact. Never
fall back to a working draft or a different release. Publication and static-host
delivery must preserve representation selection and caching together; a second
artifact alone does not establish content negotiation on a static host.

Literal non-HTML documents under ADR 0049, including authored Markdown, XML,
robots.txt and llms.txt, retain their existing MIME and literal-body behavior.
This feature does not add Organization profiles, JSON-LD, crawler controls or a
new content-tree architecture.

### Page editor action

Add a separate View in MD action to the page editor. The main button has a text
label and performs its action directly: show the current published page in
Markdown, using the version actually served by the active release. A retained
publication or a draft must not silently substitute for that public version.

When a draft is available, present this control as a split button:

- The main left segment keeps the View in MD label and direct click action.
- A separate right segment shows a downward arrow and opens a small dropdown
  resembling a compact select box. Clicking the arrow does not execute the main
  action.
- The dropdown contains exactly one additional action: View draft in MD.

Without an available draft, omit the arrow segment and dropdown. With a draft
but no current public page, keep the draft action available and make the main
action unavailable with an explanation; do not redirect the main action to the
draft. The displayed preview clearly identifies published content versus draft.

Owner decisions, 2026-11-02: draft Markdown preview reads the last saved draft,
not unsaved editor input. It does not save the editor. Exclude navigation menus
and footers from Markdown while preserving the main page content. Published
preview selects the active release; draft preview requires editor access.

Draft viewing uses authorized, site-scoped preview composition, including its
template, chunks, TVs and Snippets, followed by the same Markdown conversion.
Keep the preview private, no-store and noindex under the existing preview access
boundary. Viewing does not publish, activate a release, save the form implicitly
or discard editor changes. The public Accept negotiation never exposes this
draft-preview operation.

The two button segments have separate accessible names and keyboard focus.
Support keyboard activation, dropdown navigation, Escape dismissal and focus
return. Localize labels, state explanations and errors in the existing English
and Russian administration interface. Preserve the established responsive editor
toolbar and the separate save/publication actions.

### Implementation boundary

This decision authorizes recording the 0.10.0 capability, not implementing it as
part of 0.8.0. Before implementation, agree the affected inbound/outbound contracts
and explicit failure results under the repository workflow. Specify the exact
draft-availability predicate in the existing single-editable-draft model and
whether draft preview reads saved content or an explicit unsaved editor snapshot;
neither may imply an automatic save. Finalize conversion/extraction rules and
static-host negotiation integration with representative composed-page fixtures.

## Acceptance criteria for 0.10.0

- A composed fixture with main Markdown, Text/Markdown/Image/File TVs, nested
  chunks and Snippet results yields the same meaningful content in HTML and MD.
  Scripts/styles are absent from Markdown; links and image alternatives remain
  usable.
- Accept negotiation, quality values, Vary, representation validators, GET/HEAD,
  conditional responses, redirects and literal non-HTML documents behave
  consistently without changing ordinary HTML delivery.
- Static artifacts and Request output remain bound to the selected release.
  Request data executes once, Build values remain frozen, and cross-site access,
  unavailable data and corrupt-publication failures do not expose drafts.
- The editor covers published-only, published-with-draft and draft-only states.
  The main click opens published MD; only the arrow opens the one-item menu;
  selecting its item opens draft MD. Preview failures preserve editor input.
- Public output stays unchanged after editing or previewing a draft. Draft
  preview requires authorization and cannot be retrieved through public routes.
  Verify keyboard/focus behavior, localization and supported responsive widths.

The original acceptance of this ADR executed no runtime checks. Implementation
and upgrade behavior are described in the linked publication contract.
