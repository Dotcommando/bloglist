import type { Cluster } from '../../../domain/clusters/cluster.js';

export interface IArchiveClusterInput {
  clusterId: string;
}

export interface IArchiveCluster {
  execute(input: IArchiveClusterInput): Promise<Cluster>;
}
