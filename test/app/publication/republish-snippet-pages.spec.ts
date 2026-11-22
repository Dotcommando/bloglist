import { LoaderExecutionAdapter } from '../../../src/adapters/outbound/rendering/modx/loader-execution.adapter.js';
import { ModxCompositionAdapter } from '../../../src/adapters/outbound/rendering/modx/template-composition.adapter.js';
import { RenderDataService } from '../../../src/app/services/publication/render-data.service.js';
import {
  RepublishSnippetPagesUseCase,
} from '../../../src/app/use-cases/publication/republish-snippet-pages.use-case.js';
import {
  UpdateAndRepublishRenderingElementUseCase,
} from '../../../src/app/use-cases/rendering/update-and-republish-rendering-element.use-case.js';
import { LoaderPhase } from '../../../src/domain/pages/page-rendering.js';
import { type IPublicationReleaseState, ReleaseState } from '../../../src/domain/publication/publication-release.js';
import { PublishedRouteKind } from '../../../src/domain/publication/published-route.js';
import { ParameterKind } from '../../../src/domain/publication/render-plan.js';
import { TemplateSourceKind } from '../../../src/domain/publication/render-plan.js';
import { ElementUsageKind } from '../../../src/domain/rendering/rendering-element.js';
import { fakeHookChanges } from '../../support/hooks.js';
import { FakePublicationStore, FakeReleaseActivation, source } from '../../support/publication.js';
import { elementFixture } from '../../support/rendering.js';

it('rebuilds published dependencies and preserves activation on failure', async () => {
  const captured = source('Updated snippet');
  const state = captured.pages[0]!;
  const store = new FakePublicationStore();
  const activation = new FakeReleaseActivation();
  const original: IPublicationReleaseState = {
    releaseId: 'old',
    siteId: 'site-1',
    siteKey: 'demo',
    state: ReleaseState.Ready,
    createdAt: new Date(),
    completedAt: new Date(),
    failure: null,
    manifest: {
      routes: [{
        kind: PublishedRouteKind.Static,
        pageId: 'page-1',
        urlId: 'url-1',
        path: '/',
        documentPath: 'index.html',
      }],
      artifacts: [],
      publishedPages: [],
    },
  };

  store.records.set('old', original);
  activation.active.set('site-1', { siteId: 'site-1', releaseId: 'old', activatedAt: new Date() });
  const buildPage = vi.fn(async () => {
    throw new Error('build failed');
  });
  const composition = new ModxCompositionAdapter();
  const prepare = vi.spyOn(composition, 'prepare');
  const runtime = new RenderDataService(composition, new LoaderExecutionAdapter([]));
  const operation = new RepublishSnippetPagesUseCase({
    find: async () => [
      { kind: ElementUsageKind.Page, id: 'page-1', title: 'Published' },
      { kind: ElementUsageKind.Page, id: 'draft-only', title: 'Draft only' },
    ],
  }, { capture: async () => captured }, composition, runtime, { buildPage }, store, activation,
  { now: () => new Date(), nextReleaseId: () => 'new' }, fakeHookChanges);

  await expect(operation.execute({ siteId: 'site-1', key: 'Snippet' })).rejects.toThrow('build failed');
  expect(prepare).toHaveBeenCalledTimes(1);
  expect(prepare.mock.calls[0]?.[0]).toMatchObject({ pages: [state] });
  expect(activation.active.get('site-1')?.releaseId).toBe('old');
  const saved = elementFixture({
    kind: TemplateSourceKind.Snippet,
    snippet: {
      code: 'return {};',
      phases: [LoaderPhase.Build],
      output: {
        name: 'result',
        kind: ParameterKind.Object,
        required: true,
      },
    },
  });
  const republication = { execute: vi.fn(async () => {}) };

  await new UpdateAndRepublishRenderingElementUseCase({ execute: async () => saved }, republication)
    .execute({ ...saved, expectedVersion: 'v1' });
  expect(republication.execute).toHaveBeenCalledWith({ siteId: 'site-1', key: 'Home' });
});
