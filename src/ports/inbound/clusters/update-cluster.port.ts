import type { Cluster } from '../../../domain/clusters/cluster.js';

export interface IUpdateClusterInput {
  siteId: string;
  clusterId: string;
  name?: string;
  descriptionMd?: string | null;
  industry?: string | null;
  geography?: string | null;
  primaryQuery?: string | null;
}

export interface IUpdateCluster {
  execute(input: IUpdateClusterInput): Promise<Cluster>;
}
