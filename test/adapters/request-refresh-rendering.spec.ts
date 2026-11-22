import { DocumentOutputAdapter } from '../../src/adapters/outbound/rendering/html/document-output.adapter.js';
import { JsonLdDocumentAdapter } from '../../src/adapters/outbound/rendering/html/json-ld-document.adapter.js';
import { MarkdownConversionAdapter } from '../../src/adapters/outbound/rendering/html/markdown-conversion.adapter.js';
import { ModxCompositionAdapter } from '../../src/adapters/outbound/rendering/modx/template-composition.adapter.js';
import {
  RequestRefreshWorkerAdapter,
} from '../../src/adapters/outbound/rendering/workers/request-refresh-worker.adapter.js';
import { JsonLdRenderRuntimeService } from '../../src/app/services/json-ld/json-ld-render-runtime.service.js';
import {
  PublishedDocumentRenderingService,
} from '../../src/app/services/publication/published-document-rendering.service.js';
import { RenderDataService } from '../../src/app/services/publication/render-data.service.js';
import { BuildJsonLdPageUseCase } from '../../src/app/use-cases/json-ld/build-json-ld-page.use-case.js';
import { HtmlDelivery, LoaderPhase } from '../../src/domain/pages/page-rendering.js';
import { DocumentRepresentation } from '../../src/domain/publication/published-document.js';
import { ParameterKind } from '../../src/domain/publication/render-plan.js';
import { RequestCacheScope } from '../../src/domain/publication/request-cache.policy.js';
import type { ISnippet } from '../../src/ports/outbound/publication/data-loader.port.js';
import { source } from '../support/publication.js';

it('runs the actual production renderer in a Worker with equivalent HTML, Markdown and CSP', async () => {
  const loader: ISnippet = {
    id: 'Read',
    parameters: [],
    output: { name: 'result', kind: ParameterKind.String, required: true },
    phases: [LoaderPhase.Request],
    cache: { scope: RequestCacheScope.SharedPublic, maxAgeMs: 60000 },
    read: async () => '<public & escaped>',
  };
  const original = source('[[!Read? &as=`value`]]<p>[[+value]]</p>[[*contentMd:markdown]]');
  const snapshot = {
    ...original,
    pages: original.pages.map((page) => ({
      ...page,
      contentMd: '# Frozen Markdown',
      rendering: {
        ...page.rendering!,
        delivery: HtmlDelivery.Request,
        requestCache: { scope: RequestCacheScope.SharedPublic, ttlMs: 60000 },
      },
    })),
  };
  const composition = new ModxCompositionAdapter([loader]);
  const plan = await composition.prepare(snapshot, 'page-1');
  const input = {
    stored: {
      siteId: snapshot.siteId,
      releaseId: 'r',
      plan,
      assets: { head: '<style>p{color:red}</style>', body: '' },
    },
    values: {},
    representation: DocumentRepresentation.Markdown,
  };
  const execute = vi.fn(async (_id, parameters, context) => loader.read(parameters, context));
  const runtime = new JsonLdRenderRuntimeService(new RenderDataService(composition,
    { validate: vi.fn(), execute }), new BuildJsonLdPageUseCase(), new JsonLdDocumentAdapter());
  const foreground = new PublishedDocumentRenderingService(
    runtime, new DocumentOutputAdapter(), new MarkdownConversionAdapter(),
  );
  const adapter = new RequestRefreshWorkerAdapter(
    new URL('../../dist/infra/publication/request-refresh-worker.js', import.meta.url),
    { execute }, [{
      id: loader.id,
      parameters: loader.parameters,
      output: loader.output,
      phases: loader.phases,
      cache: loader.cache,
    }]);

  try {
    const expected = await foreground.generate(input);
    const actual = await adapter.regenerate(input, new AbortController().signal);

    expect(actual).toEqual(expected);
    expect(actual.html).toContain('&lt;public &amp; escaped&gt;');
    expect(actual.markdown).toContain('Frozen Markdown');
    expect(actual.inlineStyleHashes).toHaveLength(1);
    expect(execute).toHaveBeenLastCalledWith('Read', {}, expect.objectContaining({ background: true }), true);
  } finally {
    await adapter.onModuleDestroy();
  }
});
