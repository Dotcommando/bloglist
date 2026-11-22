import { DeploymentState, type IDeploymentStatus } from '../../../domain/deployment/deployment.js';
import type { IDeploymentActor, IGetDeploymentStatus } from '../../../ports/inbound/deployment/deployment.port.js';
import type { IDeploymentAccessPort } from '../../../ports/outbound/deployment/deployment-access.port.js';
import type { IDeploymentPublicationPort } from '../../../ports/outbound/deployment/deployment-publication.port.js';
import type { IDeploymentStorePort } from '../../../ports/outbound/deployment/deployment-store.port.js';

export class GetDeploymentStatusUseCase implements IGetDeploymentStatus {
  constructor(private readonly store: IDeploymentStorePort, private readonly access: IDeploymentAccessPort,
    private readonly publications: IDeploymentPublicationPort) {}

  async execute(input: IDeploymentActor): Promise<IDeploymentStatus> {
    await this.access.requireAdministrator(input.siteId, input.actorId);
    const record = await this.store.get(input.siteId);
    const publication = await this.publications.current(input.siteId);

    return {
      target: record?.target ?? null,
      version: record?.version ?? null,
      activeReleaseId: publication?.releaseId ?? null,
      state: record?.state ?? DeploymentState.Idle,
      attempts: record?.attempts ?? 0,
      retryAt: record?.retryAt ?? null,
      diagnostic: record?.diagnostic ?? null,
      delivered: record?.delivered ?? null,
    };
  }
}
