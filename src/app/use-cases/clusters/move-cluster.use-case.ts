import type { Cluster } from '../../../domain/clusters/cluster.js';
import type { IMoveCluster, IMoveClusterInput } from '../../../ports/inbound/clusters/move-cluster.port.js';
import type { IClusterRepository } from '../../../ports/outbound/clusters/cluster.repository.js';
import type { ClusterScopeService } from '../../services/clusters/cluster-scope.service.js';

export class MoveClusterUseCase implements IMoveCluster {
  constructor(
    private readonly clusters: IClusterRepository,
    private readonly scope: ClusterScopeService,
  ) {}

  async execute(input: IMoveClusterInput): Promise<Cluster> {
    const cluster = await this.scope.requireCluster(input.siteId, input.clusterId);
    const expectedCluster = cluster.toState();

    cluster.moveTo(input.parentClusterId);
    const visited = new Set([cluster.clusterId]);
    let ancestorId = cluster.parentClusterId;

    while (ancestorId !== null) {
      if (visited.has(ancestorId)) {
        throw new RangeError('Cluster hierarchy cannot contain a cycle');
      }

      visited.add(ancestorId);
      const ancestor = await this.scope.requireCluster(cluster.siteId, ancestorId);

      if (ancestor.language !== cluster.language) {
        throw new RangeError('Parent and child clusters must use the same language');
      }

      ancestorId = ancestor.parentClusterId;
    }

    return this.clusters.move({ expectedCluster, parentClusterId: cluster.parentClusterId });
  }
}
