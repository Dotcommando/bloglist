# Agreed behavior

An administrator can build a site from empty storage using the real administration:
create the site and first page, author a template, extract chunks, create simple
breadcrumbs/pagination Snippets, assign and fill image TVs, publish and verify
public output. Cover Original image URLs and prepared responsive image outputs.
Edit SEO/Open Graph, toggle indexing and check the active sitemap. Move page URLs
with/without redirects, create nested paths and materialize virtual folders.

The owner requests broad interaction coverage of Pages, Templates, Chunks,
Snippets, TVs, Files and URLs. Existing focused browser coverage supplements the
connected real-backend journey; synthetic HTTP fixtures must be labeled honestly.

Run locally once before each minor release through an explicit command. Reuse
existing Playwright/Chromium tooling. Build once, run independent isolated files
in bounded parallel workers, and keep dependent site-building steps sequential.
Failures fail the command; missing prerequisites must never silently skip tests.
Do not operate on installed sites or start the owner's persistent CMS application.

Follow-up request: review uncovered interactions in the same sections and add
tests on 0.16.0. Use the concrete coverage matrix; distinguish existing coverage
outside the release gate from absent browser evidence. Maintain bounded parallel
execution and fix reproduced defects within the existing contracts if encountered.

Continuation after f5f09c7: cover every scenario enumerated in the owner's
remaining-gap question; see [N01-N21](80-remaining-scenarios.md). Add real browser
proof for advanced contracts/runtime execution, page details, TV assignment and
stale state, file replacement/folders/concurrent writers, routing rejections and
transport/session recovery. Include all new files plus existing real TV and
Request-cache runtime suites in the bounded parallel gate. Commit verified
changes to 0.16.0. Do not invent a redirect-cycle authoring capability: selectors
exclude invalid targets; a second stale editor proves server conflict rejection.
