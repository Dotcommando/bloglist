# Public-site frontend and CSS delivery

The maintained frontend contract for generated public sites. Read
with [rendering/publication](rendering-and-publication.md) and the
[administration boundary](admin-frontend.md).


This section's template/chunk build and delivery contracts govern generated
public-site pages. The Svelte admin application follows its separate
build boundary in admin/AGENTS.md; shared authored CSS/accessibility conventions still apply.

Author HTML, ordinary CSS and strict TypeScript. Compile browser TS to plain JS;
the public result is HTML + CSS + JS + required media, without a frontend framework
by default. JavaScript is optional and loaded only for dependencies used by a page.
Keep server code, Node/Nest dependencies and secrets out of browser bundles.

Use established build packages for TypeScript compilation, bundling, HTML/CSS/JS
minification and JS obfuscation. Vite is the default frontend build integration;
it does not replace NestJS bootstrap or prescribe the template syntax. Do not
write compilers, minifiers, parsers or generic obfuscators from scratch.
Production JS must be minified and obfuscated; keep readable development output
and private diagnostic source maps. Minify emitted production HTML and both CSS
groups as well. Obfuscation is not a security boundary.
Preserve DOM/ARIA IDs, `data-*` hooks, API field names, public exports and CSP
compatibility. Do not enable eval-based transformations or rename public property
contracts. Verify behavior against the actual production output.

Prefer external hashed JS modules, shared where useful and included once per page;
`type="module"` provides deferred execution by default. Do not use synchronous
blocking scripts, install a runtime for static content or inline business logic
as event-handler attributes. Serve the referenced build version coherently.

## Authored CSS and responsiveness

- Authored CSS length units are `px`, `%`, `vh` and `vw`. Do not introduce `rem`,
  `em`, `ch`, physical units or other length units without an explicit owner
  instruction. Unitless zero, line-height, counts and ratios are valid; time and
  angle units are not length units. `fr` is allowed for grid track fractions,
  not as an extra length unit. `calc()`/`min()`/`max()`/`clamp()` may combine
  permitted values; safe-area `env()` insets are allowed.
- Build mobile first from 320 CSS px and prioritize iPhone Safari. Use only the
  four shared upward layout thresholds `576px`, `768px`, `992px`, `1200px` as
  needed, not extra layout breakpoints per component. Cap and center the desktop
  composition at `1440px`; the cap is not a fifth media query. Prefer wrapping
  and fluid geometry. Reduced-motion and other accessibility/media capabilities
  are not additional layout thresholds.
- Use flat shortened BEM: `.block`, `._element`, `._element__modifier`. Never
  prefix an element with its block or use nested/descendant BEM selectors.
  Classes have unique owners across templates, shell and chunk library; reuse
  that owner's styles rather than redefining another owner's class. A modifier
  can deliberately override its own base. Keep stable JS hooks in `data-*`.
- Inspect `320`, `375`, `390`, `393`, `402`, `414`, `430`, `440` CSS px, each
  breakpoint and its lower edge, and `1440px` for affected frontend compositions.
  Check overflow, keyboard/focus, zoom, reduced motion and relevant Safari behavior.

## CSS build classification and extraction

Before every publication build, parse and validate CSS for all registered
templates, chunks and page overrides; compute route dependencies and generate two
site/release-wide common files plus at most two inline page-specific groups.
Maintain only one authored CSS source per owner; authors do not manually synchronize
separate reflow/repaint files. Unused variants are validated but do not inflate
the published common CSS. Compute usage across the complete published route set,
including request-rendered route compositions and declared interactive states.

Common styles are the site's base/shell styles and styles of template/chunk
dependencies used by multiple routes. A dependency used by one route and explicit
page overrides belong to that page's inline groups. For a single-route landing,
the base/shell may still be common; do not duplicate a rule in common and inline
output. An empty group is omitted, never an empty file/request. Site/release
boundaries remain explicit; do not combine different sites' CSS accidentally.
Do not infer usage solely from currently visible DOM: include responsive, focus,
validation, modal, API-result and other declared dynamic states.

Classify declarations using a maintained conservative property policy:

- Structural (`reflow`): dimensions and min/max sizes, box sizing, display,
  positioning/insets, flex/grid, alignment, overflow, margins/padding/gaps,
  border widths/styles, font metrics/family/size/weight, line-height, text layout
  and other declarations that can affect geometry or structural behavior.
- Visual (`repaint`): explicitly known geometry-independent decorations,
  including `color`, `background-color`, `background-image` and border colors.
  Names are delivery groups, not a promise that all browser rendering work falls
  into exactly these two categories; transforms/compositing are not a third file.
- Unknown, mixed or unsafe-to-split declarations remain structural. Custom
  properties needed by structural rules must exist in the head, including their
  transitive fallback dependencies. Only exclusively visual variables may move
  to the visual group. Never defer a variable that controls width or typography.

Use a CSS AST and established shorthand expansion tools, not regexes or string
splitting. Split mixed declaration blocks without losing selector or conditional
context. Expand `border` shorthands semantically: width/style are structural and
color is visual, including implied defaults, resets and `currentColor` behavior.
Preserve associated longhands, border-image resets, declaration order and
`!important`; if exact equivalence cannot be established, retain the coupled
declarations structurally or fail with a diagnostic rather than changing output.
Apply the same conservative rule to `all`, resets and other mixed shorthands.

Preserve media/supports/container rules, cascade layers and their ordering,
specificity, inheritance, custom properties, pseudo-elements and keyframe
dependencies. Keep `@font-face` and geometry-affecting animation dependencies
available structurally. Establish common-before-page override order in source;
extract only when the cascade remains equivalent. In particular, moving a common
declaration after a page declaration or detaching a late reset must not reverse
the winner. Reject unsupported cascade interactions explicitly. Minify after
classification; do not let optimization recombine the two delivery groups.
Resolve/rewrite asset URLs relative to the final CSS/HTML location and reject
unresolved `@import` chains that evade the pipeline.

## Final HTML injection contract

Inject structural CSS **inside `<head>`, immediately before `</head>`**, never
before the opening `<head>`. Inject visual CSS immediately before `</body>`.
Within each group, common styles precede the page-specific overrides:

```html
<head>
  <!-- metadata and other document head content -->
  <link rel="stylesheet" href="/assets/styles/common.reflow.HASH.css">
  <style data-zarya="page-reflow">/* minified page-only structural CSS */</style>
</head>
<body>
  <!-- rendered template/chunks and optional module script references -->
  <link rel="stylesheet" href="/assets/styles/common.repaint.HASH.css">
  <style data-zarya="page-repaint">/* minified page-only visual CSS */</style>
</body>
```

The two common groups are external `<link rel="stylesheet">` resources with
content hashes and immutable asset caching. Page-only groups are `<style>` blocks
and cause no additional stylesheet GET requests. CSS background/font URLs can
still issue media/font requests. Request-rendered responses use the same placement
and prebuilt route asset plan; only values depending on the request are computed
then. Never build selectors or raw CSS from unchecked request values.
Use a CSP-compatible nonce/hash policy for inline styles without exposing private
data or adding unsafe eval. Static pages need stable hashes/header integration;
per-request nonces must not be baked into a shared static artifact.

## Visual stability and Cumulative Layout Shift (CLS)

Use this structural/visual CSS split as the project's established optimization
for stable initial page geometry and improved Core Web Vitals, primarily
**Cumulative Layout Shift (CLS)**. Its purpose is to avoid visible jumps while
the page is being drawn: make geometry-affecting styles available in the head,
then apply visual decoration without changing the established layout. Preserve
this delivery order when extending the renderer; do not replace it with another
CSS strategy without an explicit owner request.

CLS quantifies unexpected visible layout shifts; it is a unitless score, not
the timestamp of the last page change. Aim for zero unexpected shifts and a
field CLS of **0.1 or less at the 75th percentile**, assessed separately for
mobile and desktop. See [Google's CLS definition and target](https://web.dev/articles/cls).
Keep the metric name and this purpose explicit in performance-related changes.

Structural styles must establish sizes, spacing, borders and font metrics before
the initial visible layout. Reserve image/video dimensions and asynchronous
widget space, and use compatible font fallbacks so late media, font or API data
does not move existing content. Visual CSS and the build's shorthand/custom-
property handling must preserve that geometry. Verify the final built output
for layout shifts in initial loading and interactive states, including a cold
cache and constrained network. Record actual CLS when assessing the optimization.
