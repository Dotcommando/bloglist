import type { Cluster } from '../../../domain/clusters/cluster.js';

export interface IGetClusterInput {
  clusterId: string;
}

export interface IGetCluster {
  execute(input: IGetClusterInput): Promise<Cluster | null>;
}
