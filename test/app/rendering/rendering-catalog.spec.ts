import { RenderingCatalogService } from '../../../src/app/services/rendering/rendering-catalog.service.js';
import { elementFixture, FakeElementStore } from '../../support/rendering.js';

describe('rendering source catalog', () => {
  it('reads database entities first, falls back only on absence and never on an error', async () => {
    const store = new FakeElementStore();
    const item = elementFixture();
    const fallback = { list: vi.fn(async () => [elementFixture({ html: 'file' })]) };
    const catalog = new RenderingCatalogService(store, fallback);

    expect((await catalog.find(item))?.html).toBe('file');
    await store.save(item, null);
    fallback.list.mockClear();
    expect((await catalog.find(item))?.html).toBe(item.html);
    expect(fallback.list).not.toHaveBeenCalled();
    vi.spyOn(store, 'find').mockRejectedValue(new Error('Database unavailable'));
    await expect(catalog.find(item)).rejects.toThrow('Database unavailable');
    expect(fallback.list).not.toHaveBeenCalled();
    expect((await catalog.list('site-1'))[0]?.html).toBe(item.html);
    expect(fallback.list).toHaveBeenCalledWith('site-1', [item]);
  });
});
