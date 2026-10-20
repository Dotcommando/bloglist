import { ClusterBlogPlacement } from '../../../domain/clusters/cluster-blog-placement.js';
import { ClusterConflictError } from '../../../domain/clusters/cluster-conflict.error.js';
import { ClusterNotFoundError } from '../../../domain/clusters/cluster-not-found.error.js';
import type {
  IAddBlogToCluster,
  IAddBlogToClusterInput,
} from '../../../ports/inbound/clusters/add-blog-to-cluster.port.js';
import type { IBlogLookupPort } from '../../../ports/outbound/clusters/blog-lookup.port.js';
import type { IClusterBlogRepository } from '../../../ports/outbound/clusters/cluster-blog.repository.js';
import type { IClusterBlogCreationValues } from '../../../ports/outbound/clusters/cluster-blog-creation-values.port.js';
import type { ClusterScopeService } from '../../services/clusters/cluster-scope.service.js';

export class AddBlogToClusterUseCase implements IAddBlogToCluster {
  constructor(
    private readonly placements: IClusterBlogRepository,
    private readonly blogs: IBlogLookupPort,
    private readonly scope: ClusterScopeService,
    private readonly creationValues: IClusterBlogCreationValues,
  ) {}

  async execute(input: IAddBlogToClusterInput): Promise<ClusterBlogPlacement> {
    await this.scope.requireCluster(input.siteId, input.clusterId);
    const at = this.creationValues.currentInstant();
    const placement = new ClusterBlogPlacement({
      clusterBlogPlacementId: this.creationValues.nextPlacementId(),
      clusterId: input.clusterId,
      blogId: input.blogId,
      position: input.position,
      notesMd: input.notesMd ?? null,
      visible: input.visible === undefined ? true : input.visible,
      createdAt: at,
      updatedAt: at,
    });

    if (!await this.blogs.exists(placement.blogId)) {
      throw new ClusterNotFoundError('Blog was not found');
    }
    if (await this.placements.findByClusterAndBlog(placement.clusterId, placement.blogId)) {
      throw new ClusterConflictError('Blog is already placed in this cluster');
    }

    return this.placements.save(placement);
  }
}
