import type { Cluster } from '../../../domain/clusters/cluster.js';
import type { IArchiveCluster, IArchiveClusterInput } from '../../../ports/inbound/clusters/archive-cluster.port.js';
import type { IClusterRepository } from '../../../ports/outbound/clusters/cluster.repository.js';
import type { ClusterScopeService } from '../../services/clusters/cluster-scope.service.js';

export class ArchiveClusterUseCase implements IArchiveCluster {
  constructor(
    private readonly clusters: IClusterRepository,
    private readonly scope: ClusterScopeService,
  ) {}

  async execute(input: IArchiveClusterInput): Promise<Cluster> {
    const cluster = await this.scope.requireCluster(input.siteId, input.clusterId);

    cluster.archive();

    return this.clusters.save(cluster);
  }
}
