import { RenderPublishedPageUseCase } from '../../../src/app/use-cases/publication/render-published-page.use-case.js';
import { HtmlDelivery, LoaderPhase } from '../../../src/domain/pages/page-rendering.js';
import { DocumentRepresentation, type IStoredRequestPlan } from '../../../src/domain/publication/published-document.js';
import { source } from '../../support/publication.js';

export function storedPlan(): IStoredRequestPlan {
  const page = source('').pages[0]!;

  return {
    siteId: 'site-1',
    releaseId: 'release-1',
    assets: { head: '<style>h1{height:10px}</style>', body: '' },
    plan: {
      planId: 'page-1',
      siteId: 'site-1',
      pageId: 'page-1',
      page,
      rendering: { ...page.rendering!, delivery: HtmlDelivery.Request },
      settings: {},
      requestParameters: [],
      buildValues: { 'root/catalog': 'Frozen' },
      templates: [],
      loaders: [],
      frontendSourceIds: [],
    },
  };
}

describe('RenderPublishedPage', () => {
  it('observes semantic stages without executing the runtime twice', async () => {
    const stages: string[] = [];
    const observation = {
      measure: async <T>(stage: string, operation: () => Promise<T>): Promise<T> => {
        stages.push(stage);

        return operation();
      },
      sync: <T>(stage: string, operation: () => T): T => {
        stages.push(stage);

        return operation();
      },
      outcome: () => {},
    };
    const render = vi.fn(async () => ({ pageId: 'page-1', html: '<html></html>', frontendSourceIds: [] }));
    const operation = new RenderPublishedPageUseCase({ readPlan: async () => storedPlan() }, { render }, {
      normalizeRequest: (_schema,
        input) =>
        input,
      complete: async (html) =>
        ({
          html,
          inlineStyleHashes: [],
        }),
      inlineStyleHashes: () =>
        [],
    },
    {
      getActive: vi.fn(),
      activate: vi.fn(),
      findActivation: async () =>
        ({
          siteId: 'site-1',
          releaseId: 'release-1',
          activatedAt: new Date(),
        }),
    },
    {
      toMarkdown: () =>
        'markdown',
    },
    observation);

    await operation.execute({
      siteId: 'site-1',
      releaseId: 'release-1',
      renderPlanId: 'page-1',
      representation: DocumentRepresentation.Markdown,
    });
    expect(stages).toEqual(['activation', 'plan', 'request', 'runtime', 'assets', 'markdown']);
    expect(render).toHaveBeenCalledOnce();
  });
  it('loads the pinned activated plan and uses the runtime without reading current sources or building', async () => {
    const stored = storedPlan();
    const readPlan = vi.fn(async () => stored);
    const render = vi.fn(async () => ({
      pageId: 'page-1',
      html: '<html><head></head><body>Current</body></html>',
      frontendSourceIds: [],
    }));
    const complete = vi.fn(async () => ({ html: 'Final HTML', inlineStyleHashes: ['sha256-hash'] }));
    const operation = new RenderPublishedPageUseCase({ readPlan }, { render }, {
      normalizeRequest: (_schema, input) => input, complete, inlineStyleHashes: () => [],
    }, {
      getActive: vi.fn(),
      activate: vi.fn(),
      findActivation: async () => ({ siteId: 'site-1', releaseId: 'release-1', activatedAt: new Date() }),
    }, { toMarkdown: vi.fn() });

    expect(await operation.execute({
      siteId: 'site-1',
      releaseId: 'release-1',
      renderPlanId: 'page-1',
      requestValues: { date: '2026-10-25' },
    }))
      .toEqual({ releaseId: 'release-1', pageId: 'page-1', html: 'Final HTML', inlineStyleHashes: ['sha256-hash'] });
    expect(readPlan).toHaveBeenCalledWith('site-1', 'release-1', 'page-1');
    expect(render).toHaveBeenCalledWith(stored.plan, false, { date: '2026-10-25' }, LoaderPhase.Request, undefined);
  });
  it('converts a Request page from the resolved document without executing loaders again', async () => {
    const stored = storedPlan();
    const render = vi.fn(async () => ({
      pageId: 'page-1',
      html: '<html><body><h1>Current</h1></body></html>',
      frontendSourceIds: [],
    }));
    const toMarkdown = vi.fn(() => '# Current');
    const operation = new RenderPublishedPageUseCase({ readPlan: async () => stored }, { render }, {
      normalizeRequest: (_schema, input) => input,
      complete: async (html) => ({ html, inlineStyleHashes: [] }),
      inlineStyleHashes: () => [],
    }, {
      getActive: vi.fn(),
      activate: vi.fn(),
      findActivation: async () => ({ siteId: 'site-1', releaseId: 'release-1', activatedAt: new Date() }),
    }, { toMarkdown });
    const result = await operation.execute({
      siteId: 'site-1',
      releaseId: 'release-1',
      renderPlanId: 'page-1',
      representation: DocumentRepresentation.Markdown,
    });

    expect(result.markdown).toBe('# Current');
    expect(toMarkdown).toHaveBeenCalledWith('<html><body><h1>Current</h1></body></html>');
    expect(render).toHaveBeenCalledTimes(1);
  });
  it('does not expose a never-activated release or foreign plan', async () => {
    const readPlan = vi.fn(async () => storedPlan());
    const activation = { getActive: vi.fn(), activate: vi.fn(), findActivation: vi.fn(async () => null) };
    const failedStages: string[] = [];
    const operation = new RenderPublishedPageUseCase({ readPlan }, { render: vi.fn() }, {
      normalizeRequest: () => ({}), complete: vi.fn(), inlineStyleHashes: () => [],
    }, activation, { toMarkdown: vi.fn() }, {
      measure: async <T>(stage: string, operation: () => Promise<T>): Promise<T> => {
        try {
          return await operation();
        } catch (error) {
          failedStages.push(stage);
          throw error;
        }
      },
      sync: <T>(_stage: string, operation: () => T): T => operation(),
      outcome: () => {},
    });

    await expect(operation.execute({ siteId: 'site-1', releaseId: 'release-1', renderPlanId: 'page-1' }))
      .rejects.toMatchObject({ code: 'NotFound' });
    expect(readPlan).not.toHaveBeenCalled();
    expect(failedStages).toEqual(['activation']);
  });
});
