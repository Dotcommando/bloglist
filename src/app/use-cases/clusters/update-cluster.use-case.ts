import { Cluster } from '../../../domain/clusters/cluster.js';
import { ClusterNotFoundError } from '../../../domain/clusters/cluster-not-found.error.js';
import { ClusterScopeError } from '../../../domain/clusters/cluster-scope.error.js';
import type { IUpdateCluster, IUpdateClusterInput } from '../../../ports/inbound/clusters/update-cluster.port.js';
import type { IClusterRepository } from '../../../ports/outbound/clusters/cluster.repository.js';

export class UpdateClusterUseCase implements IUpdateCluster {
  constructor(private readonly clusters: IClusterRepository) {}

  async execute(input: IUpdateClusterInput): Promise<Cluster> {
    const existing = await this.clusters.findById(input.clusterId);

    if (!existing) {
      throw new ClusterNotFoundError('Cluster was not found');
    }
    if (existing.siteId !== input.siteId) {
      throw new ClusterScopeError('Cluster belongs to another site');
    }

    const cluster = new Cluster(existing.toState());

    if (input.name !== undefined) {
      cluster.rename(input.name);
    }
    if (input.descriptionMd !== undefined) {
      cluster.changeDescription(input.descriptionMd);
    }
    if (input.industry !== undefined) {
      cluster.changeIndustry(input.industry);
    }
    if (input.geography !== undefined) {
      cluster.changeGeography(input.geography);
    }
    if (input.primaryQuery !== undefined) {
      cluster.changePrimaryQuery(input.primaryQuery);
    }

    return this.clusters.save(cluster);
  }
}
