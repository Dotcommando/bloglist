import { LoaderExecutionAdapter } from '../../src/adapters/outbound/rendering/modx/loader-execution.adapter.js';
import { ModxCompositionAdapter } from '../../src/adapters/outbound/rendering/modx/template-composition.adapter.js';
import { RenderDataService } from '../../src/app/services/publication/render-data.service.js';
import { SnippetSchedulerService } from '../../src/app/services/publication/snippet-scheduler.service.js';
import { HtmlDelivery, LoaderPhase } from '../../src/domain/pages/page-rendering.js';
import { ParameterKind, TemplateSourceKind } from '../../src/domain/publication/render-plan.js';
import { SnippetExecution } from '../../src/domain/rendering/snippet.js';
import type { ISnippet } from '../../src/ports/outbound/publication/data-loader.port.js';
import { source } from '../support/publication.js';

it('overlaps sibling chunks without sharing their aliases and keeps the unselected If branch dormant', async () => {
  let release!: () => void;
  let ready!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const calls: string[] = [];
  const snippets: ISnippet[] = ['A', 'B', 'Unused'].map((id) => ({
    id,
    execution: SnippetExecution.ParallelRead,
    phases: [LoaderPhase.Request],
    parameters: [],
    output: { name: 'result', kind: ParameterKind.String, required: true },
    read: async () => {
      calls.push(id);

      if (calls.length === 2) {
        ready();
      }
      await gate;

      return id;
    },
  }));
  const input = source('[[If? &condition=`true` &then=`Left` &else=`Unused`]][[$Right]]');
  const snapshot = {
    ...input,
    pages: input.pages.map((page) => ({ ...page, rendering: { ...page.rendering!, delivery: HtmlDelivery.Request } })),
    templates: [...input.templates, ...['Left', 'Right', 'Unused'].map((id, index) => ({
      id,
      kind: TemplateSourceKind.Chunk,
      revision: 'one',
      parameters: [],
      html: `[[!${['A', 'B', 'Unused'][index]}? &as=\`local\`]][[+local]]`,
    }))],
  };
  const composition = new ModxCompositionAdapter(snippets);
  const execution = new LoaderExecutionAdapter(snippets);
  const plan = await composition.prepare(snapshot, 'page-1');
  const pending = new RenderDataService(composition, execution).render(plan, false);

  try {
    await started;
    expect(calls).toEqual(['A', 'B']);
    release();
    expect((await pending).html).toContain('AB');
  } finally {
    release();
    await execution.onModuleDestroy();
  }
});

it('shares the render admission budget across Each instances and preserves array order', async () => {
  let release!: () => void;
  let ready!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    ready = resolve;
  });
  let running = 0;
  let maximum = 0;
  const snippets: ISnippet[] = [{
    id: 'Items',
    execution: SnippetExecution.ParallelRead,
    phases: [LoaderPhase.Request],
    parameters: [],
    output: {
      name: 'result',
      kind: ParameterKind.Array,
      required: true,
      items: { name: 'item', kind: ParameterKind.Number, required: true },
    },
    read: async () => [1, 2, 3, 4],
  }, {
    id: 'Read',
    execution: SnippetExecution.ParallelRead,
    phases: [LoaderPhase.Request],
    parameters: [{ name: 'value', kind: ParameterKind.Number, required: true }],
    output: { name: 'result', kind: ParameterKind.String, required: true },
    read: async (input) => {
      running++;
      maximum = Math.max(maximum, running);

      if (running === 2) {
        ready();
      }
      await gate;
      running--;

      return String(input.value);
    },
  }];
  const input = source('[[!Items? &as=`items`]][[Each? &items=`[[+items]]` &chunk=`Row`]]');
  const snapshot = {
    ...input,
    pages: input.pages.map((page) => ({ ...page, rendering: { ...page.rendering!, delivery: HtmlDelivery.Request } })),
    templates: [...input.templates, {
      id: 'Row',
      kind: TemplateSourceKind.Chunk,
      revision: 'one',
      parameters: [{ name: 'item', kind: ParameterKind.Number, required: true }],
      html: '[[!Read? &value=`[[+item]]` &as=`result`]][[+result]]',
    }],
  };
  const composition = new ModxCompositionAdapter(snippets);
  const execution = new LoaderExecutionAdapter(snippets);
  const plan = await composition.prepare(snapshot, 'page-1');
  const scheduler = new SnippetSchedulerService({ perRender: 2 });
  const pending = new RenderDataService(composition, execution, 10000, undefined, scheduler).render(plan, false);

  try {
    await started;
    expect(maximum).toBe(2);
    release();
    expect((await pending).html).toContain('1234');
    expect(maximum).toBe(2);
  } finally {
    release();
    await execution.onModuleDestroy();
  }
});
