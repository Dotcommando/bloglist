import { ModxCompositionAdapter } from '../../../src/adapters/outbound/rendering/modx/template-composition.adapter.js';
import { RenderDataService } from '../../../src/app/services/publication/render-data.service.js';
import { LoaderPhase } from '../../../src/domain/pages/page-rendering.js';
import { PublicationConsistencyError } from '../../../src/domain/publication/published-document.js';
import type { IRenderPlan } from '../../../src/domain/publication/render-plan.js';
import { ParameterKind } from '../../../src/domain/publication/render-plan.js';
import type { ILoaderExecutionPort } from '../../../src/ports/outbound/publication/loader-execution.port.js';
import type { ITemplateCompositionPort } from '../../../src/ports/outbound/publication/template-composition.port.js';
import { requestPlanFixture } from '../../support/delivery.js';
import { source } from '../../support/publication.js';

describe('render binding memoization', () => {
  it('fails a damaged published plan instead of recomputing a missing frozen Build value', async () => {
    const stored = requestPlanFixture();
    const plan = {
      ...stored.plan,
      templates: stored.plan.templates.map((template) => ({
        ...template,
        html: '<html><head></head><body>[[Frozen? &as=`data`]][[+data]]</body></html>',
      })),
    };
    const composition = new ModxCompositionAdapter([{
      id: 'Frozen',
      parameters: [],
      output: { name: 'value', kind: ParameterKind.String, required: true },
      phases: [LoaderPhase.Build],
      read: vi.fn(),
    }]);
    const execute = vi.fn();

    await expect(new RenderDataService(composition, { validate: () => {}, execute }).render(plan, false))
      .rejects.toBeInstanceOf(PublicationConsistencyError);
    expect(execute).not.toHaveBeenCalled();
  });
  it('does not let an optional fallback hide the failure of a required binding', async () => {
    const page = source('').pages[0]!;
    const plan: IRenderPlan = {
      planId: 'plan',
      pageId: page.pageId,
      siteId: page.siteId,
      page,
      rendering: page.rendering!,
      templates: [],
      settings: {},
      requestParameters: [],
      buildValues: {},
      loaders: [],
      frontendSourceIds: [],
    };
    const binding = {
      alias: 'optional',
      loaderId: 'Loader',
      phase: LoaderPhase.Build,
      parameters: {},
      dependsOn: [],
      required: false,
    };
    const composition: ITemplateCompositionPort = {
      prepare: async () => plan,
      compose: async (_plan, _values, execution) => {
        await execution.read(binding, {});
        await execution.read({ ...binding, alias: 'required', required: true }, {});

        return { pageId: page.pageId, html: 'partial', frontendSourceIds: [] };
      },
    };
    const execute = vi.fn<ILoaderExecutionPort['execute']>(async (_id, _input, _context, required) => {
      if (required) {
        throw new Error('Required dependency failed');
      }

      return 'fallback';
    });

    await expect(new RenderDataService(composition, { validate: () => {}, execute }).render(
      plan, false, {}, LoaderPhase.Build))
      .rejects.toThrow('Required dependency failed');
  });
});
