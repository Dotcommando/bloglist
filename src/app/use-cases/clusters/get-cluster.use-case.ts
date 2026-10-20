import type { Cluster } from '../../../domain/clusters/cluster.js';
import { ClusterScopeError } from '../../../domain/clusters/cluster-scope.error.js';
import type { IGetCluster, IGetClusterInput } from '../../../ports/inbound/clusters/get-cluster.port.js';
import type { IClusterRepository } from '../../../ports/outbound/clusters/cluster.repository.js';

export class GetClusterUseCase implements IGetCluster {
  constructor(private readonly clusters: IClusterRepository) {}

  async execute(input: IGetClusterInput): Promise<Cluster | null> {
    const cluster = await this.clusters.findById(input.clusterId);

    if (cluster && cluster.siteId !== input.siteId) {
      throw new ClusterScopeError('Cluster belongs to another site');
    }

    return cluster;
  }
}
