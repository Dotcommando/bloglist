import type { Cluster } from '../../../domain/clusters/cluster.js';

export interface IArchiveClusterInput {
  siteId: string;
  clusterId: string;
}

export interface IArchiveCluster {
  execute(input: IArchiveClusterInput): Promise<Cluster>;
}
