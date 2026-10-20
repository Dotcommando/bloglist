import type { IClusterBlogPosition } from '../../../domain/clusters/cluster-blog-position.js';

export interface IReorderClusterBlogsInput {
  siteId: string;
  clusterId: string;
  positions: IClusterBlogPosition[];
}

export interface IReorderClusterBlogs {
  execute(input: IReorderClusterBlogsInput): Promise<void>;
}
