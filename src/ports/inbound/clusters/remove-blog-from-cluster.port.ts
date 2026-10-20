export interface IRemoveBlogFromClusterInput {
  siteId: string;
  clusterId: string;
  blogId: string;
}

export interface IRemoveBlogFromCluster {
  execute(input: IRemoveBlogFromClusterInput): Promise<void>;
}
