import type {
  IRemoveBlogFromCluster,
  IRemoveBlogFromClusterInput,
} from '../../../ports/inbound/clusters/remove-blog-from-cluster.port.js';
import type { IClusterBlogRepository } from '../../../ports/outbound/clusters/cluster-blog.repository.js';
import type { ClusterBlogPlacementScopeService } from '../../services/clusters/cluster-blog-placement-scope.service.js';

export class RemoveBlogFromClusterUseCase implements IRemoveBlogFromCluster {
  constructor(
    private readonly placements: IClusterBlogRepository,
    private readonly scope: ClusterBlogPlacementScopeService,
  ) {}

  async execute(input: IRemoveBlogFromClusterInput): Promise<void> {
    await this.scope.requirePlacement(input.siteId, input.clusterId, input.blogId);
    await this.placements.remove(input.clusterId, input.blogId);
  }
}
