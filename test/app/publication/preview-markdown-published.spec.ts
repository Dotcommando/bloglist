import {
  PreviewMarkdownPublishedUseCase,
} from '../../../src/app/use-cases/publication/preview-markdown-published.use-case.js';
import { ReleaseState } from '../../../src/domain/publication/publication-release.js';
import { DocumentRepresentation } from '../../../src/domain/publication/published-document.js';
import { PublishedRouteKind } from '../../../src/domain/publication/published-route.js';

describe('PreviewMarkdownPublished', () => {
  it('does not read publication metadata for an unauthorized actor', async () => {
    const getActive = vi.fn();
    const operation = new PreviewMarkdownPublishedUseCase(
      { assertEditor: vi.fn().mockRejectedValue(new Error('Denied')) },
      { getActive, activate: vi.fn(), findActivation: vi.fn() }, { read: vi.fn(), stage: vi.fn() },
      { execute: vi.fn() }, { execute: vi.fn() });

    await expect(operation.execute({ siteId: 'site-1', actorId: 'foreign', pageId: 'page-1' }))
      .rejects.toThrow('Denied');
    expect(getActive).not.toHaveBeenCalled();
  });
  it('reads the currently active request plan without falling back to a draft', async () => {
    const activation = {
      getActive: vi.fn(async () => ({ siteId: 'site-1', releaseId: 'active', activatedAt: new Date() })),
      activate: vi.fn(),
      findActivation: vi.fn(),
    };
    const read = vi.fn(async () => ({
      siteId: 'site-1',
      releaseId: 'active',
      state: ReleaseState.Ready as const,
      failure: null,
      createdAt: new Date(),
      completedAt: new Date(),
      manifest: {
        artifacts: [],
        routes: [{
          kind: PublishedRouteKind.Request as const,
          urlId: 'url',
          path: '/',
          pageId: 'page-1',
          renderPlanId: 'plan',
        }],
      },
    }));
    const render = vi.fn(async () => ({
      releaseId: 'active',
      pageId: 'page-1',
      html: '<h1>Published</h1>',
      markdown: '# Published',
      inlineStyleHashes: [],
    }));
    const operation = new PreviewMarkdownPublishedUseCase({ assertEditor: vi.fn() }, activation,
      { read, stage: vi.fn() }, { execute: render }, { execute: vi.fn() });

    expect(await operation.execute({ siteId: 'site-1', actorId: 'owner', pageId: 'page-1' }))
      .toEqual({ markdown: '# Published' });
    expect(read).toHaveBeenCalledWith('site-1', 'active', true);
    expect(render).toHaveBeenCalledWith(expect.objectContaining({
      releaseId: 'active', renderPlanId: 'plan', representation: DocumentRepresentation.Markdown,
    }));
  });
});
