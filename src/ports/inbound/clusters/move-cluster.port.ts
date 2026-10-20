import type { Cluster } from '../../../domain/clusters/cluster.js';

export interface IMoveClusterInput {
  clusterId: string;
  parentClusterId: string | null;
}

export interface IMoveCluster {
  execute(input: IMoveClusterInput): Promise<Cluster>;
}
