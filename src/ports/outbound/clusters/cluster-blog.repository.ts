import type { IClusterBlogFilter } from '../../../domain/clusters/cluster-blog-filter.js';
import type { ClusterBlogPlacement } from '../../../domain/clusters/cluster-blog-placement.js';
import type { IClusterBlogPosition } from '../../../domain/clusters/cluster-blog-position.js';

export interface IClusterBlogRepository {
  findByCluster(clusterId: string, filter?: IClusterBlogFilter): Promise<ClusterBlogPlacement[]>;
  findByClusterAndBlog(clusterId: string, blogId: string): Promise<ClusterBlogPlacement | null>;
  save(placement: ClusterBlogPlacement): Promise<ClusterBlogPlacement>;
  remove(clusterId: string, blogId: string): Promise<void>;
  updatePositions(clusterId: string, positions: IClusterBlogPosition[]): Promise<void>;
}
