import type { IClusterLookupPort } from '../src/ports/outbound/pages/cluster-lookup.port.js';
import type { IPageRepository } from '../src/ports/outbound/pages/page.repository.js';
import type { ISiteLookupPort } from '../src/ports/outbound/pages/site-lookup.port.js';

export function pageRepository(): IPageRepository {
  return {
    findById: vi.fn<IPageRepository['findById']>().mockResolvedValue(null),
    findByMark: vi.fn<IPageRepository['findByMark']>().mockResolvedValue(null),
    findBySite: vi.fn<IPageRepository['findBySite']>().mockResolvedValue([]),
    findByCluster: vi.fn<IPageRepository['findByCluster']>().mockResolvedValue([]),
    save: vi.fn<IPageRepository['save']>().mockImplementation(async (page) => page),
  };
}

export function pagesSiteLookup(): ISiteLookupPort {
  return {
    findSite: vi.fn<ISiteLookupPort['findSite']>().mockResolvedValue({ siteId: 'site-1', languages: ['en', 'de'] }),
  };
}

export function clusterLookup(): IClusterLookupPort {
  return {
    findCluster: vi.fn<IClusterLookupPort['findCluster']>().mockResolvedValue({
      clusterId: 'cluster-1', siteId: 'site-1', language: 'en',
    }),
  };
}
