# ADR 0072: Prepare inline style hashes during publication

Date: 2026-11-10

Status: Accepted through the owner's CMS 0.12.0 implementation request.

## Decision

Publication prepares the exact inline CSS text and CSP hash in each immutable
page asset injection. The optional inlineStyles field is additive; old plans
remain valid. Incremental and routing-only builds prepare it again after asset
requalification. The plan decoder validates each supplied text/hash pair.

Request output still performs the established production HTML minification to
preserve dynamic whitespace and attribute semantics. A SAX scan of that exact
result replaces construction/traversal of a second whole-document DOM. It reuses
a prepared hash only when the actual CSS text matches; dynamic and changed text
is hashed normally. Deduplication and order remain those of the delivered styles.
This removes repeated DOM allocation and static CSS hashing without guessing
that dynamic HTML can skip final minification. Asset placement, Markdown output,
Content-Length and CSP continue to describe the actual delivered document.
