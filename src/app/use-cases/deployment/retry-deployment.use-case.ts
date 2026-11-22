import { DeploymentState, type IDeploymentStatus } from '../../../domain/deployment/deployment.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { IGetDeploymentStatus, IRetryDeployment } from '../../../ports/inbound/deployment/deployment.port.js';
import type {
  IDeploymentAccessPort, IDeploymentValuesPort,
} from '../../../ports/outbound/deployment/deployment-access.port.js';
import type { IDeploymentPublicationPort } from '../../../ports/outbound/deployment/deployment-publication.port.js';
import type { IDeploymentStorePort } from '../../../ports/outbound/deployment/deployment-store.port.js';

export class RetryDeploymentUseCase implements IRetryDeployment {
  constructor(private readonly store: IDeploymentStorePort, private readonly access: IDeploymentAccessPort,
    private readonly publications: IDeploymentPublicationPort, private readonly values: IDeploymentValuesPort,
    private readonly status: IGetDeploymentStatus) {}

  async execute(input: Parameters<IRetryDeployment['execute']>[0]): Promise<IDeploymentStatus> {
    await this.access.requireAdministrator(input.siteId, input.actorId);
    const record = await this.store.get(input.siteId);

    if (!record) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Deployment target not configured');
    }
    if (record.version !== input.expectedVersion) {
      throw new BusinessError(BusinessErrorCode.StaleWrite, 'Deployment state changed');
    }
    if (!record.target.enabled || record.state !== DeploymentState.Failed) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Only a known failed delivery can be retried');
    }

    const publication = await this.publications.current(input.siteId);

    if (!publication) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Publish the site before requesting delivery');
    }
    await this.store.save({
      ...record,
      version: this.values.id(),
      state: DeploymentState.Queued,
      requested: publication,
      attempt: null,
      attempts: 0,
      retryAt: null,
      diagnostic: null,
    }, record.version);

    return this.status.execute(input);
  }
}
