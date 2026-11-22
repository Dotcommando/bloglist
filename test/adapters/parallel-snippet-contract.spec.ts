import { decodePlan } from '../../src/adapters/outbound/publication/files/plan-decoder.js';
import { SnippetExecution } from '../../src/domain/rendering/snippet.js';
import { parseSnippetSource } from '../../src/domain/rendering/snippet-source.policy.js';
import { requestPlanFixture } from '../support/delivery.js';

it('validates editable execution metadata and freezes it through the published plan codec', () => {
  const snippet = {
    code: 'return "read";',
    phases: ['Request'],
    output: { name: 'result', kind: 'String', required: true },
    execution: 'ParallelRead',
  };

  expect(parseSnippetSource(snippet).execution).toBe(SnippetExecution.ParallelRead);
  expect(() => parseSnippetSource({ ...snippet, execution: 'guess' })).toThrow();
  const fixture = requestPlanFixture();
  const encoded = JSON.parse(JSON.stringify({
    ...fixture.plan, snippetExecutions: { Read: SnippetExecution.ParallelRead }, assets: fixture.assets,
  }));

  expect(decodePlan(encoded).plan.snippetExecutions).toEqual({ Read: SnippetExecution.ParallelRead });
  expect(() => decodePlan({ ...encoded, snippetExecutions: { Read: 'guess' } })).toThrow();
  delete encoded.snippetExecutions;
  expect(decodePlan(encoded).plan.snippetExecutions).toBeUndefined();
});
