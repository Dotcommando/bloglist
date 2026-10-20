import { ClusterBlogPlacement } from '../../../domain/clusters/cluster-blog-placement.js';
import { ClusterNotFoundError } from '../../../domain/clusters/cluster-not-found.error.js';
import type { IClusterBlogRepository } from '../../../ports/outbound/clusters/cluster-blog.repository.js';
import type { ClusterScopeService } from './cluster-scope.service.js';

export class ClusterBlogPlacementScopeService {
  constructor(
    private readonly scope: ClusterScopeService,
    private readonly placements: IClusterBlogRepository,
  ) {}

  async requirePlacement(siteId: string, clusterId: string, blogId: string): Promise<ClusterBlogPlacement> {
    await this.scope.requireCluster(siteId, clusterId);
    const placement = await this.placements.findByClusterAndBlog(clusterId, blogId);

    if (!placement) {
      throw new ClusterNotFoundError('Cluster blog placement was not found');
    }
    if (placement.clusterId !== clusterId || placement.blogId !== blogId) {
      throw new RangeError('Placement does not match the requested cluster and blog');
    }

    return new ClusterBlogPlacement(placement.toState());
  }
}
