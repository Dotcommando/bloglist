import type { Cluster } from '../../../domain/clusters/cluster.js';
import type { IClusterFilter } from '../../../domain/clusters/cluster-filter.js';

export interface IClusterRepository {
  findById(clusterId: string): Promise<Cluster | null>;
  findByMark(mark: string): Promise<Cluster | null>;
  findBySite(siteId: string, filter?: IClusterFilter): Promise<Cluster[]>;
  save(cluster: Cluster): Promise<Cluster>;
}
