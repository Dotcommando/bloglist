import type { IDeploymentRecord } from '../../../domain/deployment/deployment.js';

export interface IDeploymentStorePort {
  get(siteId: string): Promise<IDeploymentRecord | null>;
  list(): Promise<readonly IDeploymentRecord[]>;
  save(record: IDeploymentRecord, expectedVersion: string | null): Promise<void>;
}
