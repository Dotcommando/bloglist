# ADR 0073: Prepare immutable page Markdown during publication

Date: 2026-11-10

Status: Accepted through the owner's CMS 0.12.0 implementation request.

## Decision

When a reachable template/chunk uses the page contentMd Markdown value,
composition preparation may store its rendered HTML with the exact effective
source and trust classification. Rendering reuses it only for the same page
value and classification. Page parameters and TV overrides retain their existing
precedence; trusted TV markup retains its existing behavior. Request Snippet
values and chunk parameters continue to be rendered at execution time.

Initially exclude content containing a potential numeric page-link tag from this
optimization. Its route resolution remains live within the frozen plan as before,
including routing-only release updates and missing/ambiguous-link failures.
This conservative eligibility check does not parse or interpret those tags.

Use one Markdown/sanitization implementation for publication preparation and
runtime fallback. The additive preparedMarkdown field is optional in persisted
plans; legacy plans use the runtime path. No Build loader is rerun by Request
rendering, and no request data is promoted to a publication-time constant.
