import { GetRenderingElementUseCase } from '../../../src/app/use-cases/rendering/get-rendering-element.use-case.js';
import { elementFixture } from '../../support/rendering.js';
import { siteFixture } from '../../support/sites.js';

describe('GetRenderingElement', () => {
  it('returns owned sources and usages, hiding missing and foreign identities', async () => {
    const item = elementFixture();
    const catalog = { find: vi.fn(async () => item), list: vi.fn() };
    const usages = { find: vi.fn(async () => []) };
    const useCase = new GetRenderingElementUseCase({ execute: async () => siteFixture() }, catalog, usages);

    expect(await useCase.execute(item)).toMatchObject({ version: 'v1', usages: [] });
    catalog.find.mockResolvedValue(elementFixture({ siteId: 'other' }));
    await expect(useCase.execute(item)).rejects.toMatchObject({ code: 'NotFound' });
    expect(usages.find).toHaveBeenCalledTimes(1);
  });
});
