import { LoaderExecutionAdapter } from '../../src/adapters/outbound/rendering/modx/loader-execution.adapter.js';
import { ModxCompositionAdapter } from '../../src/adapters/outbound/rendering/modx/template-composition.adapter.js';
import { RenderDataService } from '../../src/app/services/publication/render-data.service.js';
import { HtmlDelivery, LoaderPhase } from '../../src/domain/pages/page-rendering.js';
import { ParameterKind } from '../../src/domain/publication/render-plan.js';
import { SnippetExecution } from '../../src/domain/rendering/snippet.js';
import type { ISnippet } from '../../src/ports/outbound/publication/data-loader.port.js';
import { source } from '../support/publication.js';

it('starts independent declarations together, resolves a shared dependency once and emits stable HTML', async () => {
  let release!: () => void;
  let bothStarted!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    bothStarted = resolve;
  });
  const calls: string[] = [];
  const make = (id: string): ISnippet => ({
    id,
    execution: SnippetExecution.ParallelRead,
    parameters: [],
    output: { name: 'result', kind: ParameterKind.String, required: true },
    phases: [LoaderPhase.Request],
    read: async () => {
      calls.push(id);

      if (calls.length === 2) {
        bothStarted();
      }
      await gate;

      return id;
    },
  });
  const snippets = [make('A'), make('B')];
  const composition = new ModxCompositionAdapter(snippets);
  const input = source('<html><head></head><body>'
    + '[[!A? &as=`a`]][[!A? &as=`same`]][[!B? &as=`b`]][[+a]][[+same]][[+b]]</body></html>');
  const snapshot = {
    ...input,
    pages: input.pages.map((page) => ({
      ...page, rendering: { ...page.rendering!, delivery: HtmlDelivery.Request },
    })),
  };
  const plan = await composition.prepare(snapshot, 'page-1');
  const execution = new LoaderExecutionAdapter(snippets);
  const pending = new RenderDataService(composition, execution).render(plan, false);

  try {
    await started;
    expect(calls).toEqual(['A', 'B']);
    release();
    expect((await pending).html).toContain('AAB');
  } finally {
    release();
    await execution.onModuleDestroy();
  }
});
