import 'reflect-metadata';

import { Test } from '@nestjs/testing';

import type { SnippetWorkerPool } from '../../src/adapters/outbound/rendering/modx/snippet-worker-pool.js';
import { LoaderPhase } from '../../src/domain/pages/page-rendering.js';
import { ParameterKind, TemplateSourceKind } from '../../src/domain/publication/render-plan.js';
import { LOADER_EXECUTION } from '../../src/infra/publication/publication.tokens.js';
import { publishedRuntimeProviders } from '../../src/infra/publication/published-runtime.providers.js';
import { SNIPPET_WORKER_POOL } from '../../src/infra/rendering/rendering.tokens.js';
import { readSnippetPoolSettings } from '../../src/infra/rendering/snippet-pool.settings.js';
import type { ILoaderExecutionPort } from '../../src/ports/outbound/publication/loader-execution.port.js';

it('binds one lifecycle-owned pool for frozen Snippets across phases through the real runtime providers', async () => {
  const module = await Test.createTestingModule({
    providers: publishedRuntimeProviders({}).filter((provider) => typeof provider === 'object'
      && 'provide' in provider && (provider.provide === SNIPPET_WORKER_POOL || provider.provide === LOADER_EXECUTION)),
  }).compile();
  const pool = module.get<SnippetWorkerPool>(SNIPPET_WORKER_POOL);
  const executor = module.get<ILoaderExecutionPort>(LOADER_EXECUTION);

  try {
    for (const phase of [LoaderPhase.Build, LoaderPhase.Request]) {
      expect(await executor.execute('frozen', {}, {
        siteId: 's',
        pageId: 'p',
        language: 'en',
        phase,
        preview: phase === LoaderPhase.Build,
        signal: AbortSignal.timeout(5000),
        snippetSources: [{
          id: 'frozen',
          kind: TemplateSourceKind.Snippet,
          html: '',
          revision: 'published',
          parameters: [],
          snippet: {
            code: 'invalid draft',
            compiledJavaScript: 'async function __snippet() { return "frozen"; }',
            phases: [LoaderPhase.Build, LoaderPhase.Request],
            output: { name: 'result', kind: ParameterKind.String, required: true },
          },
        }],
      }, true)).toBe('frozen');
    }
    expect(pool.snapshot().created).toBe(1);
  } finally {
    await module.close();
  }
  expect(pool.snapshot().workers).toBe(0);
});

it('validates explicit finite limits and aggregate memory before composition', () => {
  expect(readSnippetPoolSettings({})).toMatchObject({ size: 4, queueLimit: 256, queueWaitMs: 1000 });
  expect(Object.isFrozen(readSnippetPoolSettings({}))).toBe(true);

  for (const environment of [
    { ZARYA_SNIPPET_POOL_SIZE: '0' }, { ZARYA_SNIPPET_POOL_SIZE: '1' },
    { ZARYA_SNIPPET_POOL_QUEUE_LIMIT: 'Infinity' }, { ZARYA_SNIPPET_POOL_QUEUE_WAIT_MS: '-1' },
    { ZARYA_SNIPPET_POOL_SIZE: '16', ZARYA_SNIPPET_POOL_MEMORY_BUDGET_MB: '512' },
  ]) {
    expect(() => readSnippetPoolSettings(environment)).toThrow();
  }
});
