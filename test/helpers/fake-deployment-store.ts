import type { IDeploymentRecord } from '../../src/domain/deployment/deployment.js';
import { BusinessError, BusinessErrorCode } from '../../src/domain/shared/business-error.js';
import type { IDeploymentStorePort } from '../../src/ports/outbound/deployment/deployment-store.port.js';

export class FakeDeploymentStore implements IDeploymentStorePort {
  readonly records = new Map<string, IDeploymentRecord>();

  async get(siteId: string): Promise<IDeploymentRecord | null> {
    return structuredClone(this.records.get(siteId) ?? null);
  }

  async list(): Promise<readonly IDeploymentRecord[]> {
    return structuredClone([...this.records.values()]);
  }

  async save(record: IDeploymentRecord, expectedVersion: string | null): Promise<void> {
    if ((this.records.get(record.siteId)?.version ?? null) !== expectedVersion) {
      throw new BusinessError(BusinessErrorCode.StaleWrite, 'Concurrent write');
    }
    this.records.set(record.siteId, structuredClone(record));
  }
}
