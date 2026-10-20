import type { Cluster } from '../../../domain/clusters/cluster.js';

export interface ICreateClusterInput {
  mark: string;
  siteId: string;
  language: string;
  name: string;
  parentClusterId?: string | null;
  descriptionMd?: string | null;
  industry?: string | null;
  geography?: string | null;
  primaryQuery?: string | null;
}

export interface ICreateCluster {
  execute(input: ICreateClusterInput): Promise<Cluster>;
}
