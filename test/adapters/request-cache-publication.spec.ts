import { ModxCompositionAdapter } from '../../src/adapters/outbound/rendering/modx/template-composition.adapter.js';
import { BrowserInteraction, HtmlDelivery, LoaderPhase } from '../../src/domain/pages/page-rendering.js';
import { ParameterKind } from '../../src/domain/publication/render-plan.js';
import { RequestCacheScope } from '../../src/domain/publication/request-cache.policy.js';
import { SnippetExecution } from '../../src/domain/rendering/snippet.js';
import { source } from '../support/publication.js';

it('rejects unclassified request dependencies in both branches and freezes separate freshness metadata', async () => {
  const base = source('[[If? &condition=`true` &then=`Card` &else=`Other`]]', '[[!Read? &as=`read`]][[+read]]');
  const snapshot = {
    ...base,
    pages: base.pages.map((page) => ({
      ...page,
      rendering: {
        templateId: 'Home',
        delivery: HtmlDelivery.Request,
        interaction: BrowserInteraction.None,
        parameters: {},
        loaders: [],
        requestCache: { scope: RequestCacheScope.SharedPublic, ttlMs: 5000 },
      },
    })),
    templates: [base.templates[0]!, { ...base.templates[1]!, parameters: [] },
      { ...base.templates[1]!, id: 'Other', parameters: [], html: '[[!Read? &as=`read`]][[+read]]' }],
  };
  const read = {
    id: 'Read',
    execution: SnippetExecution.ParallelRead,
    phases: [LoaderPhase.Request],
    parameters: [],
    output: { name: 'value', kind: ParameterKind.String, required: true },
    read: async () => 'ok',
  };

  await expect(new ModxCompositionAdapter([read]).prepare(snapshot, 'page-1')).rejects.toThrow('cache-safe');
  await expect(new ModxCompositionAdapter([
    { ...read, cache: { scope: RequestCacheScope.SharedPublic, maxAgeMs: 1000 } },
  ])
    .prepare(snapshot, 'page-1')).rejects.toThrow('freshness');
  const plan = await new ModxCompositionAdapter([
    { ...read, cache: { scope: RequestCacheScope.SharedPublic, maxAgeMs: 5000 } },
  ])
    .prepare(snapshot, 'page-1');

  expect(plan.snippetCachePolicies).toEqual({ Read: { scope: RequestCacheScope.SharedPublic, maxAgeMs: 5000 } });
});
