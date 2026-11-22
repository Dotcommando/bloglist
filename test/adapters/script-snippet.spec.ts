import { RenderObservationAdapter } from '../../src/adapters/outbound/diagnostics/render-observation.adapter.js';
import { ScriptSnippetAdapter } from '../../src/adapters/outbound/rendering/modx/script-snippet.adapter.js';
import { SnippetWorkerPool } from '../../src/adapters/outbound/rendering/modx/snippet-worker-pool.js';
import { RenderStage } from '../../src/domain/diagnostics/page-resolution.js';
import { LoaderPhase } from '../../src/domain/pages/page-rendering.js';
import { type ITemplateSource, ParameterKind, TemplateSourceKind } from '../../src/domain/publication/render-plan.js';
import type { CmsApi } from '../../src/ports/inbound/cms/cms-api.port.js';
import type { IRenderObservationPort } from '../../src/ports/outbound/diagnostics/render-observation.port.js';

let pool: SnippetWorkerPool;

beforeEach(() => {
  pool = new SnippetWorkerPool();
});

afterEach(async () => {
  await pool.onModuleDestroy();
});

const createSnippet = (source: ITemplateSource, observation?: IRenderObservationPort): ScriptSnippetAdapter =>
  new ScriptSnippetAdapter(source, observation, pool);

describe('editable TypeScript Snippets', () => {
  const source = (code: string): ITemplateSource => ({
    id: 'Greeting',
    name: 'Greeting',
    kind: TemplateSourceKind.Snippet,
    revision: 'v1',
    html: '',
    parameters: [],
    snippet: {
      code,
      phases: [LoaderPhase.Request],
      output: { name: 'result', kind: ParameterKind.String, required: true },
    },
  });
  const context = {
    siteId: 'site-1',
    pageId: 'page-1',
    language: 'en',
    phase: LoaderPhase.Request,
    preview: false,
    signal: AbortSignal.timeout(5000),
    publishedPages: [],
  };

  it('observes worker readiness, execution, decoding and deferred teardown', async () => {
    const observation = new RenderObservationAdapter();
    const trace = observation.create();
    const snippet = createSnippet(source('return "observed";'), observation);

    expect(await observation.run(trace, () => snippet.read({}, {
      ...context, signal: AbortSignal.timeout(5000),
    }))).toBe('observed');
    await observation.waitForCompletion(trace);
    expect(trace.stages.map((stage) => stage.stage)).toEqual(expect.arrayContaining([
      RenderStage.WorkerStartup, RenderStage.Script, RenderStage.Transfer, RenderStage.Cleanup,
    ]));
    expect(trace.stages.every((stage) => stage.outcome === 'Success')).toBe(true);
  });

  it('compiles typed function bodies, returns JSON data and exposes only the scoped context', async () => {
    const snippet = createSnippet(source(
      'const label: string = "Hello"; return label + " " + context.siteId;'));

    expect(await snippet.read({}, context)).toBe('Hello site-1');
    expect(await createSnippet(source('return typeof process + ":" + typeof require + ":" + typeof fetch;'))
      .read({}, context)).toBe('undefined:undefined:undefined');
    await expect(createSnippet(source('return input.constructor.constructor("return process")();'))
      .read({}, context)).rejects.toThrow();
    await expect(createSnippet(source('return await import("node:fs");'))
      .read({}, context)).rejects.toThrow();
  });
  it('terminates loops and rejected async execution without leaking worker details', async () => {
    await expect(createSnippet(source('while (true) {}')).read({}, {
      ...context, signal: AbortSignal.timeout(100),
    })).rejects.toThrow();
    await expect(createSnippet(source('throw new Error("private");')).read({}, context)).rejects.toThrow();
    expect(() => createSnippet(source('return {;'))).toThrow();
  });
  it.each([
    { phase: LoaderPhase.Build, preview: false },
    { phase: LoaderPhase.Request, preview: false },
    { phase: LoaderPhase.Build, preview: true },
    { phase: LoaderPhase.Request, preview: true },
  ])('bridges queries and commands during $phase with preview=$preview', async (selection) => {
    const writes: unknown[] = [];
    const cms: CmsApi = Object.assign(Object.create(null), {
      pages: {
        get: async () => ({ title: 'Published' }),
        update: async (input: unknown) => {
          writes.push(input);

          return { title: 'Changed' };
        },
      },
    });
    const result = await createSnippet(source(
      'const page = await cms.pages.get({ pageId: "p" }); '
      + 'await cms.pages.update({ pageId: "p", title: "Changed" }); return page.title;'))
      .read({}, { ...context, ...selection, cms, signal: AbortSignal.timeout(5000) });

    expect(result).toBe('Published');
    expect(writes).toEqual([{ pageId: 'p', title: 'Changed' }]);
  });

  it('retains completed writes after a later snippet exception and exposes no host functions', async () => {
    let count = 0;
    const cms: CmsApi = Object.assign(Object.create(null), {
      pages: {
        update: async () => {
          count++;

          return {};
        },
      },
    });

    await expect(createSnippet(source(
      'await cms.pages.update({ pageId: "p", title: "Changed" }); throw new Error("Failed later");'))
      .read({}, { ...context, cms, signal: AbortSignal.timeout(5000) })).rejects.toThrow();
    expect(count).toBe(1);
    expect(await createSnippet(source(
      'return typeof cms.constructor + ":" + typeof process + ":" + typeof fetch;'))
      .read({}, { ...context, cms, signal: AbortSignal.timeout(5000) })).toBe('undefined:undefined:undefined');
  });

  it('preserves a legacy local cms binding while exposing the client through context', async () => {
    const cms: CmsApi = Object.assign(Object.create(null), {
      pages: { get: async () => ({ title: 'API title' }) },
    });

    expect(await createSnippet(source(
      'const cms = "Legacy"; return cms + ":" + (await context.cms.pages.get({pageId:"p"})).title;'))
      .read({}, { ...context, cms, signal: AbortSignal.timeout(5000) })).toBe('Legacy:API title');
  });

  it('executes frozen JavaScript without transpiling newer draft text', async () => {
    const compiled = createSnippet(source('return "Published";')).compiledJavaScript;
    const draft = source('return {;');
    const frozen = createSnippet({
      ...draft,
      snippet: { ...draft.snippet!, compiledJavaScript: compiled },
    });

    expect(await frozen.read({}, context)).toBe('Published');
  });
});
