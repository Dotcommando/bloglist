# Existing behavior and evidence

Existing Playwright browser suites cover individual rendering/TV/image controls;
many use deterministic HTTP fixtures and cannot prove publication composition.
Real HTTP suites cover Files, URLs and single-page publication. Reuse these
guarantees and helpers rather than introducing a second browser dependency.

Owning contracts: [administration](../../../arch/admin-frontend.md),
[elements](../../../arch/rendering-element-editing.md),
[TVs](../../../arch/template-variables.md), [Snippets](../../../arch/snippets.md),
[URLs](../../../arch/url-workspace.md).

Relevant known defects:

- [Retained favicon](../../../defects/publication/retained-favicon-rejected.md):
  retain a Request page while publishing another page and moving URLs.
- [New page partial publication](../../../defects/admin/new-page-partial-publication-state.md):
  preserve truthful saved/public state and avoid implicit replay.
- [Media fixture selection](../../../defects/qa/media-tests-selected-unrelated-resources.md):
  select only owned, explicitly named resources.
- [Shared artifact storage](../../../defects/qa/implicit-shared-artifact-storage.md):
  isolate filesystem roots as well as databases before parallel execution.
- [System documents](../../../defects/qa/system-document-fixture-assumptions.md):
  a fresh site already contains CMS system pages; do not assume page counts/ordinals.

Other media defect records concern adapter failure mechanisms unchanged here;
existing regressions remain their proof, without duplicating fault injection in UI.

Follow-up at 084c36b: reviewed the actual controls and assertions, including
admin-i18n's saved/public JSON-LD and Markdown controls outside the previous gate,
the twelve desktop/mobile hierarchy-selection cases outside that gate, and
files-layout's Update addresses / Keep old addresses choices already inside it.
Add shared readonly document-action assertions to the selected page fixture and
include the existing hierarchy file; do not duplicate its scroll setup. Keep
JSON-LD configuration itself outside this section-scoped change. See
[gap inventory](70-coverage-gaps.md).

Reused [QA fixture drift](../../../defects/qa/admin-release-fixture-drift.md)
when the hierarchy fixture omitted background catalog reads and retained old
file-heading names. Its failures are fixture defects, not product findings.
