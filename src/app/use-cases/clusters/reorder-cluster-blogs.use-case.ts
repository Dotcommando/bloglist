import { validateClusterBlogPositions } from '../../../domain/clusters/cluster-blog-order.policy.js';
import { ClusterNotFoundError } from '../../../domain/clusters/cluster-not-found.error.js';
import type {
  IReorderClusterBlogs,
  IReorderClusterBlogsInput,
} from '../../../ports/inbound/clusters/reorder-cluster-blogs.port.js';
import type { IClusterBlogRepository } from '../../../ports/outbound/clusters/cluster-blog.repository.js';
import type { ClusterScopeService } from '../../services/clusters/cluster-scope.service.js';

export class ReorderClusterBlogsUseCase implements IReorderClusterBlogs {
  constructor(
    private readonly placements: IClusterBlogRepository,
    private readonly scope: ClusterScopeService,
  ) {}

  async execute(input: IReorderClusterBlogsInput): Promise<void> {
    await this.scope.requireCluster(input.siteId, input.clusterId);
    const positions = input.positions.map((entry) => ({ blogId: entry.blogId, position: entry.position }));

    validateClusterBlogPositions(positions);

    if (positions.length === 0) {
      return;
    }

    for (const entry of positions) {
      const placement = await this.placements.findByClusterAndBlog(input.clusterId, entry.blogId);

      if (!placement) {
        throw new ClusterNotFoundError('Cluster blog placement was not found');
      }
      if (placement.clusterId !== input.clusterId || placement.blogId !== entry.blogId) {
        throw new RangeError('Placement does not match the requested cluster and blog');
      }
    }

    await this.placements.updatePositions(input.clusterId, positions);
  }
}
