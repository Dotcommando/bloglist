export interface IRemoveBlogFromClusterInput {
  clusterId: string;
  blogId: string;
}

export interface IRemoveBlogFromCluster {
  execute(input: IRemoveBlogFromClusterInput): Promise<void>;
}
