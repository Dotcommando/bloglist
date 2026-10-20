import type { IClusterBlogFilter } from '../../../domain/clusters/cluster-blog-filter.js';
import type { ClusterBlogPlacement } from '../../../domain/clusters/cluster-blog-placement.js';
import type { IClusterBlogPosition } from '../../../domain/clusters/cluster-blog-position.js';

export interface IClusterBlogRepository {
  findByCluster(clusterId: string, filter?: IClusterBlogFilter): Promise<ClusterBlogPlacement[]>;
  findByClusterAndBlog(clusterId: string, blogId: string): Promise<ClusterBlogPlacement | null>;
  /** Enforce unique cluster/blog placement atomically; expose duplicates as ClusterConflictError. */
  save(placement: ClusterBlogPlacement): Promise<ClusterBlogPlacement>;
  /** Delete only this pair; an absent placement fails with ClusterNotFoundError. */
  remove(clusterId: string, blogId: string): Promise<void>;
  /**
   * Update all supplied existing pairs atomically or fail without writes.
   * Recheck membership at commit; missing pairs raise ClusterNotFoundError.
   * Preserve placement identities, notes, visibility and all unrequested pairs.
   */
  updatePositions(clusterId: string, positions: IClusterBlogPosition[]): Promise<void>;
}
