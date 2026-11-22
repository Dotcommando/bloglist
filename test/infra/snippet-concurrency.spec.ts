import 'reflect-metadata';

import { Test } from '@nestjs/testing';

import type { SnippetSchedulerService } from '../../src/app/services/publication/snippet-scheduler.service.js';
import { COMPOSITION, LOADER_EXECUTION, RENDER_RUNTIME } from '../../src/infra/publication/publication.tokens.js';
import { publishedRuntimeProviders } from '../../src/infra/publication/published-runtime.providers.js';
import { SNIPPET_SCHEDULER, SNIPPET_WORKER_POOL } from '../../src/infra/rendering/rendering.tokens.js';
import { readSnippetConcurrencySettings } from '../../src/infra/rendering/snippet-concurrency.settings.js';

it('binds the shared scheduler into the real runtime and closes admission with its module', async () => {
  const settings = readSnippetConcurrencySettings({ ZARYA_SNIPPET_PARALLEL_PER_RENDER: '2' });
  const module = await Test.createTestingModule({
    providers: publishedRuntimeProviders({ snippetConcurrency: settings }).filter((provider) =>
      typeof provider === 'object' && 'provide' in provider
      && [SNIPPET_SCHEDULER, SNIPPET_WORKER_POOL, LOADER_EXECUTION, COMPOSITION, RENDER_RUNTIME]
        .some((token) => provider.provide === token)),
  }).compile();
  const scheduler = module.get<SnippetSchedulerService>(SNIPPET_SCHEDULER);

  expect(scheduler.settings).toMatchObject({ perRender: 2, perProcess: 16 });
  expect(module.get(RENDER_RUNTIME)).toBeDefined();
  await module.close();
  await expect(scheduler.execute([], new AbortController().signal)).rejects.toThrow();
});

it('rejects invalid render/process limits and nonfinite queues at bootstrap', () => {
  expect(Object.isFrozen(readSnippetConcurrencySettings({}))).toBe(true);

  for (const environment of [
    { ZARYA_SNIPPET_PARALLEL_PER_RENDER: '0' },
    { ZARYA_SNIPPET_PARALLEL_PER_RENDER: '8', ZARYA_SNIPPET_PARALLEL_PER_PROCESS: '4' },
    { ZARYA_SNIPPET_PARALLEL_PER_PROCESS: 'Infinity' },
    { ZARYA_SNIPPET_PARALLEL_QUEUE_LIMIT: '0' },
    { ZARYA_SNIPPET_PARALLEL_QUEUE_WAIT_MS: '10001' },
  ]) {
    expect(() => readSnippetConcurrencySettings(environment)).toThrow();
  }
});
