import { PageNotFoundError } from '../../../domain/pages/page-not-found.error.js';
import { PageScopeError } from '../../../domain/pages/page-scope.error.js';
import type { IClusterLookupPort } from '../../../ports/outbound/pages/cluster-lookup.port.js';
import type { ISiteLookupPort } from '../../../ports/outbound/pages/site-lookup.port.js';

export class PageRelationshipsService {
  constructor(
    private readonly sites: ISiteLookupPort,
    private readonly clusters: IClusterLookupPort,
  ) {}

  async validate(siteId: string, language: string, clusterId: string | null): Promise<void> {
    const site = await this.sites.findSite(siteId);

    if (!site) {
      throw new PageNotFoundError('Site was not found');
    }
    if (site.siteId !== siteId) {
      throw new PageScopeError('Site lookup returned another site');
    }
    if (!site.languages.includes(language)) {
      throw new RangeError('Page language must be enabled for the site');
    }
    if (clusterId !== null) {
      const cluster = await this.clusters.findCluster(clusterId);

      if (!cluster) {
        throw new PageNotFoundError('Cluster was not found');
      }
      if (cluster.siteId !== siteId) {
        throw new PageScopeError('Cluster belongs to another site');
      }
      if (cluster.language !== language) {
        throw new RangeError('Page and cluster must use the same language');
      }
    }
  }
}
