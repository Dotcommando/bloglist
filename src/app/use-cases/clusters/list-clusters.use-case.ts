import type { Cluster } from '../../../domain/clusters/cluster.js';
import type { IClusterFilter } from '../../../domain/clusters/cluster-filter.js';
import { ClusterScopeError } from '../../../domain/clusters/cluster-scope.error.js';
import type { IListClusters, IListClustersInput } from '../../../ports/inbound/clusters/list-clusters.port.js';
import type { IClusterRepository } from '../../../ports/outbound/clusters/cluster.repository.js';

export class ListClustersUseCase implements IListClusters {
  constructor(private readonly clusters: IClusterRepository) {}

  async execute(input: IListClustersInput): Promise<Cluster[]> {
    let filter: IClusterFilter | undefined;

    if (input.filter !== undefined) {
      filter = {};

      if (input.filter.language !== undefined) {
        filter.language = input.filter.language;
      }
      if (input.filter.status !== undefined) {
        filter.status = input.filter.status;
      }
      if (input.filter.parentClusterId !== undefined) {
        filter.parentClusterId = input.filter.parentClusterId;
      }
    }

    const clusters = await this.clusters.findBySite(input.siteId, filter);

    if (clusters.some((cluster) => cluster.siteId !== input.siteId)) {
      throw new ClusterScopeError('Cluster list contains a cluster from another site');
    }

    return clusters;
  }
}
