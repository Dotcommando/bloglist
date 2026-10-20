import { Cluster } from '../../../domain/clusters/cluster.js';
import { ClusterNotFoundError } from '../../../domain/clusters/cluster-not-found.error.js';
import { ClusterScopeError } from '../../../domain/clusters/cluster-scope.error.js';
import type { IClusterRepository } from '../../../ports/outbound/clusters/cluster.repository.js';

export class ClusterScopeService {
  constructor(private readonly clusters: IClusterRepository) {}

  async requireCluster(siteId: string, clusterId: string): Promise<Cluster> {
    const cluster = await this.clusters.findById(clusterId);

    if (!cluster) {
      throw new ClusterNotFoundError('Cluster was not found');
    }
    if (cluster.siteId !== siteId) {
      throw new ClusterScopeError('Cluster belongs to another site');
    }

    return new Cluster(cluster.toState());
  }
}
