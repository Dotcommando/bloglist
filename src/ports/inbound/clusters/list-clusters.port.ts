import type { Cluster } from '../../../domain/clusters/cluster.js';
import type { IClusterFilter } from '../../../domain/clusters/cluster-filter.js';

export interface IListClustersInput {
  siteId: string;
  filter?: IClusterFilter;
}

export interface IListClusters {
  execute(input: IListClustersInput): Promise<Cluster[]>;
}
