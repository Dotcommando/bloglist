# The media browser controls had mismatched alignment

Confirmed bug in candidate `50534a2`, discovered 2026-11-25 and fixed for 0.17.0.
The controls used a native checkbox that inherited input sizing. The pager
shared the same end-aligned flex row as a labelled select. Its buttons and
status sat at different vertical positions, and the row started at the left.

Use the CMS checkbox, group the header tools and center the pager on both
axes. The page-size preference lives in Settings / General.
The [Files browser integration](../../../test/integration/file-library.integration.spec.ts)
compares the centers of the rendered controls and checks persistence.
[Candidate evidence](../../changes/0.17.0/media-browser-layout/50-verification.md).
