import type { IBlogLookupPort } from '../src/ports/outbound/clusters/blog-lookup.port.js';
import type { IClusterRepository } from '../src/ports/outbound/clusters/cluster.repository.js';
import type { IClusterBlogRepository } from '../src/ports/outbound/clusters/cluster-blog.repository.js';
import type { ISiteLookupPort } from '../src/ports/outbound/clusters/site-lookup.port.js';

export function clusterRepository(): IClusterRepository {
  return {
    findById: vi.fn<IClusterRepository['findById']>().mockResolvedValue(null),
    findByMark: vi.fn<IClusterRepository['findByMark']>().mockResolvedValue(null),
    findBySite: vi.fn<IClusterRepository['findBySite']>().mockResolvedValue([]),
    save: vi.fn<IClusterRepository['save']>().mockImplementation(async (cluster) => cluster),
    move: vi.fn<IClusterRepository['move']>().mockRejectedValue(new Error('Configure the atomic move result')),
  };
}

export function clustersSiteLookup(): ISiteLookupPort {
  return {
    findSite: vi.fn<ISiteLookupPort['findSite']>().mockResolvedValue({ siteId: 'site-1', languages: ['en', 'de'] }),
  };
}

export function clusterBlogRepository(): IClusterBlogRepository {
  return {
    findByCluster: vi.fn<IClusterBlogRepository['findByCluster']>().mockResolvedValue([]),
    findByClusterAndBlog: vi.fn<IClusterBlogRepository['findByClusterAndBlog']>().mockResolvedValue(null),
    save: vi.fn<IClusterBlogRepository['save']>().mockImplementation(async (placement) => placement),
    remove: vi.fn<IClusterBlogRepository['remove']>().mockResolvedValue(undefined),
    updatePositions: vi.fn<IClusterBlogRepository['updatePositions']>().mockResolvedValue(undefined),
  };
}

export function blogLookup(): IBlogLookupPort {
  return { exists: vi.fn<IBlogLookupPort['exists']>().mockResolvedValue(true) };
}
