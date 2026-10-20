import type { Cluster, IClusterState } from '../../../domain/clusters/cluster.js';
import type { IClusterFilter } from '../../../domain/clusters/cluster-filter.js';

export interface IClusterRepository {
  findById(clusterId: string): Promise<Cluster | null>;
  /** Global case-insensitive mark lookup. */
  findByMark(mark: string): Promise<Cluster | null>;
  findBySite(siteId: string, filter?: IClusterFilter): Promise<Cluster[]>;
  /**
   * Enforce mark uniqueness atomically; translate technical conflicts into ClusterConflictError.
   * For an existing cluster, preserve its current parent; hierarchy writes must use move.
   */
  save(cluster: Cluster): Promise<Cluster>;
  /**
   * Serialize hierarchy changes, recheck expected state and current ancestors, then return the saved cluster.
   * Reject stale state as ClusterConflictError, absent references as ClusterNotFoundError,
   * foreign sites as ClusterScopeError, and cycles/language mismatches as RangeError, without writes.
   */
  move(change: IClusterMove): Promise<Cluster>;
}

export interface IClusterMove {
  readonly expectedCluster: IClusterState;
  readonly parentClusterId: string | null;
}
