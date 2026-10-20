import type { ClusterStatus } from './cluster-status.enum.js';

export interface IClusterFilter {
  language?: string;
  status?: ClusterStatus;
  parentClusterId?: string | null;
}
