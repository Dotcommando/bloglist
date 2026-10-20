import type { IPageLookupPort } from '../src/ports/outbound/routing/page-lookup.port.js';
import type { IUrlRepository } from '../src/ports/outbound/routing/url.repository.js';

export function urlRepository(): IUrlRepository {
  return {
    findById: vi.fn<IUrlRepository['findById']>().mockResolvedValue(null),
    findByMark: vi.fn<IUrlRepository['findByMark']>().mockResolvedValue(null),
    findByPath: vi.fn<IUrlRepository['findByPath']>().mockResolvedValue(null),
    findCurrentByPage: vi.fn<IUrlRepository['findCurrentByPage']>().mockResolvedValue(null),
    findChildren: vi.fn<IUrlRepository['findChildren']>().mockResolvedValue([]),
    save: vi.fn<IUrlRepository['save']>().mockImplementation(async (url) => url),
    getHistory: vi.fn<IUrlRepository['getHistory']>().mockResolvedValue([]),
    changePageUrl: vi.fn<IUrlRepository['changePageUrl']>().mockResolvedValue(undefined),
  };
}

export function pageLookup(): IPageLookupPort {
  return {
    findPage: vi.fn<IPageLookupPort['findPage']>().mockResolvedValue({ pageId: 'page-1', siteId: 'site-1' }),
  };
}
