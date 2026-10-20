import type { ClusterBlogPlacement } from '../../../domain/clusters/cluster-blog-placement.js';

export interface IAddBlogToClusterInput {
  clusterId: string;
  blogId: string;
  position: number;
  notesMd?: string | null;
  visible?: boolean;
}

export interface IAddBlogToCluster {
  execute(input: IAddBlogToClusterInput): Promise<ClusterBlogPlacement>;
}
