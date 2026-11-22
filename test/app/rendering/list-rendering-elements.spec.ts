import { ListRenderingElementsUseCase } from '../../../src/app/use-cases/rendering/list-rendering-elements.use-case.js';
import { TemplateSourceKind } from '../../../src/domain/publication/render-plan.js';
import { elementFixture } from '../../support/rendering.js';
import { siteFixture } from '../../support/sites.js';

describe('ListRenderingElements', () => {
  it('checks site access before reading the catalog and rejects foreign results', async () => {
    const calls: string[] = [];
    const catalog = {
      find: vi.fn(),
      list: vi.fn(async () => {
        calls.push('catalog');

        return [elementFixture()];
      }),
    };
    const sites = {
      execute: vi.fn(async () => {
        calls.push('site');

        return siteFixture();
      }),
    };
    const useCase = new ListRenderingElementsUseCase(sites, catalog);

    expect(await useCase.execute({ siteId: 'site-1', kind: TemplateSourceKind.Template })).toHaveLength(1);
    expect(calls).toEqual(['site', 'catalog']);
    catalog.list.mockResolvedValue([elementFixture({ siteId: 'other' })]);
    await expect(useCase.execute({ siteId: 'site-1', kind: TemplateSourceKind.Template }))
      .rejects.toMatchObject({ code: 'NotFound' });
    sites.execute.mockRejectedValue(new Error('Denied'));
    catalog.list.mockClear();
    await expect(useCase.execute({ siteId: 'site-1', kind: TemplateSourceKind.Template })).rejects.toThrow('Denied');
    expect(catalog.list).not.toHaveBeenCalled();
  });
});
