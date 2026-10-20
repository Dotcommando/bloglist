import type { ClusterBlogPlacement } from '../../../domain/clusters/cluster-blog-placement.js';

export interface IUpdateClusterBlogPlacementInput {
  clusterId: string;
  blogId: string;
  position?: number;
  notesMd?: string | null;
  visible?: boolean;
}

export interface IUpdateClusterBlogPlacement {
  execute(input: IUpdateClusterBlogPlacementInput): Promise<ClusterBlogPlacement>;
}
