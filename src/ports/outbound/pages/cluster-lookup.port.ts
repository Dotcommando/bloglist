import type { IClusterReference } from '../../../domain/pages/cluster-reference.js';

export interface IClusterLookupPort {
  findCluster(clusterId: string): Promise<IClusterReference | null>;
}
