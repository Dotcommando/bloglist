import type { ISiteRepository } from '../src/ports/outbound/sites/site.repository.js';

export function siteRepository(): ISiteRepository {
  return {
    findById: vi.fn<ISiteRepository['findById']>().mockResolvedValue(null),
    findByMark: vi.fn<ISiteRepository['findByMark']>().mockResolvedValue(null),
    findByPrimaryDomain: vi.fn<ISiteRepository['findByPrimaryDomain']>().mockResolvedValue(null),
    findAll: vi.fn<ISiteRepository['findAll']>().mockResolvedValue([]),
    save: vi.fn<ISiteRepository['save']>().mockImplementation(async (site) => site),
  };
}
