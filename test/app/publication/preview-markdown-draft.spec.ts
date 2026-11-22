import { PreviewMarkdownDraftUseCase } from '../../../src/app/use-cases/publication/preview-markdown-draft.use-case.js';
import { PublishedRouteKind } from '../../../src/domain/publication/published-route.js';
import { requestPlanFixture } from '../../support/delivery.js';
import { source } from '../../support/publication.js';

describe('PreviewMarkdownDraft', () => {
  it('rejects unauthorized editors before reading draft data', async () => {
    const capture = vi.fn();
    const operation = new PreviewMarkdownDraftUseCase({ assertEditor: vi.fn().mockRejectedValue(new Error('Denied')) },
      { capture }, { prepare: vi.fn(), compose: vi.fn() }, { render: vi.fn() }, { build: vi.fn() },
      { nextReleaseId: () => 'preview', now: () => new Date() });

    await expect(operation.execute({ siteId: 'site-1', actorId: 'foreign', pageId: 'page-1' }))
      .rejects.toThrow('Denied');
    expect(capture).not.toHaveBeenCalled();
  });
  it('renders the saved draft once without activating a release', async () => {
    const snapshot = source('Saved draft');
    const plan = requestPlanFixture().plan;
    const document = { pageId: plan.pageId, html: '<h1>Saved draft</h1>', frontendSourceIds: [] };
    const bytes = new TextEncoder().encode('# Saved draft');
    const render = vi.fn(async () => document);
    const capture = vi.fn(async () => snapshot);
    const build = vi.fn(async () => ({
      manifest: {
        routes: [{
          kind: PublishedRouteKind.Static as const,
          urlId: 'url',
          pageId: plan.pageId,
          path: '/',
          documentPath: 'index.html',
          markdownPath: 'representations/draft.md',
        }],
        artifacts: [],
      },
      artifacts: [{
        path: 'representations/draft.md',
        mimeType: 'text/markdown',
        public: true,
        byteSize: bytes.byteLength,
        checksum: 'checksum',
        content: {
          mimeType: 'text/markdown',
          byteSize: bytes.byteLength,
          bytes: (async function* () {
            yield bytes;
          })(),
        },
      }],
    }));
    const operation = new PreviewMarkdownDraftUseCase({ assertEditor: vi.fn() }, { capture },
      { prepare: vi.fn(async () => plan), compose: vi.fn() }, { render }, { build },
      { nextReleaseId: () => 'preview', now: () => new Date('2026-11-02T00:00:00Z') });

    expect(await operation.execute({ siteId: 'site-1', actorId: 'owner', pageId: plan.pageId }))
      .toEqual({ markdown: '# Saved draft' });
    expect(capture).toHaveBeenCalledWith('site-1', plan.pageId);
    expect(render).toHaveBeenCalledOnce();
    expect(build).toHaveBeenCalledOnce();
  });
});
