import type { ClusterBlogPlacement } from '../../../domain/clusters/cluster-blog-placement.js';
import type {
  IUpdateClusterBlogPlacement,
  IUpdateClusterBlogPlacementInput,
} from '../../../ports/inbound/clusters/update-cluster-blog-placement.port.js';
import type { IClusterBlogRepository } from '../../../ports/outbound/clusters/cluster-blog.repository.js';
import type { ClusterBlogPlacementScopeService } from '../../services/clusters/cluster-blog-placement-scope.service.js';

export class UpdateClusterBlogPlacementUseCase implements IUpdateClusterBlogPlacement {
  constructor(
    private readonly placements: IClusterBlogRepository,
    private readonly scope: ClusterBlogPlacementScopeService,
  ) {}

  async execute(input: IUpdateClusterBlogPlacementInput): Promise<ClusterBlogPlacement> {
    const placement = await this.scope.requirePlacement(input.siteId, input.clusterId, input.blogId);

    if (input.position !== undefined) {
      placement.changePosition(input.position);
    }
    if (input.notesMd !== undefined) {
      placement.changeNotes(input.notesMd);
    }
    if (input.visible !== undefined) {
      if (input.visible) {
        placement.show();
      } else {
        placement.hide();
      }
    }

    return this.placements.save(placement);
  }
}
