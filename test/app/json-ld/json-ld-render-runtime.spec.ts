import { JsonLdRenderRuntimeService } from '../../../src/app/services/json-ld/json-ld-render-runtime.service.js';
import { BuildJsonLdPageUseCase } from '../../../src/app/use-cases/json-ld/build-json-ld-page.use-case.js';
import { JsonLdSourceKind } from '../../../src/domain/json-ld/json-ld-catalog.js';
import { requestPlanFixture } from '../../support/delivery.js';

it('uses a captured catalog and prepared snippet output once and retains private projection inputs', async () => {
  const base = requestPlanFixture().plan;
  const catalog = {
    siteId: base.siteId,
    version: 'v1',
    objects: [],
    profiles: [{
      profileId: 'article',
      name: 'Article',
      templateIds: [base.rendering.templateId],
      nodes: [{
        role: 'article',
        type: 'Article',
        mappings: [{
          property: 'headline', required: true, source: { kind: JsonLdSourceKind.Snippet as const, name: 'headline' },
        }],
      }],
    }],
  };
  const render = vi.fn(async () => ({
    pageId: base.pageId,
    html: '<html><head></head><body>Public</body></html>',
    frontendSourceIds: [],
    snippetValues: { headline: 'Prepared' },
  }));
  const embed = vi.fn((html: string) => html + 'embedded');
  const runtime = new JsonLdRenderRuntimeService({ render }, new BuildJsonLdPageUseCase(), { embed });
  const result = await runtime.render({
    ...base, jsonLd: { catalog, origin: 'https://example.test', routes: [] },
  }, false);

  expect(render).toHaveBeenCalledOnce();
  expect(embed).toHaveBeenCalledOnce();
  expect(result.html).toContain('embedded');
  expect(result.jsonLd?.input.snippetValues).toEqual({ headline: 'Prepared' });
  expect(result.jsonLd?.result?.graph['@graph'][0]?.headline).toBe('Prepared');
});
