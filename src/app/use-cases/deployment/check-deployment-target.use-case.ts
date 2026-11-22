import { DeploymentIssue, type IDeploymentDiagnostic } from '../../../domain/deployment/deployment.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { ICheckDeploymentTarget, IDeploymentActor } from '../../../ports/inbound/deployment/deployment.port.js';
import type { IDeploymentAccessPort } from '../../../ports/outbound/deployment/deployment-access.port.js';
import type { IDeploymentInspectionPort } from '../../../ports/outbound/deployment/deployment-inspection.port.js';
import type { IDeploymentProviderCataloguePort } from '../../../ports/outbound/deployment/deployment-provider.port.js';
import type { IDeploymentPublicationPort } from '../../../ports/outbound/deployment/deployment-publication.port.js';
import type { IDeploymentStorePort } from '../../../ports/outbound/deployment/deployment-store.port.js';

export class CheckDeploymentTargetUseCase implements ICheckDeploymentTarget {
  constructor(private readonly store: IDeploymentStorePort, private readonly access: IDeploymentAccessPort,
    private readonly publications: IDeploymentPublicationPort,
    private readonly catalogue: IDeploymentProviderCataloguePort,
    private readonly inspection: IDeploymentInspectionPort) {}

  async execute(input: IDeploymentActor): Promise<readonly IDeploymentDiagnostic[]> {
    await this.access.requireAdministrator(input.siteId, input.actorId);
    const record = await this.store.get(input.siteId);

    if (!record) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Deployment target not configured');
    }

    try {
      if (!this.catalogue.supports(record.target.providerKey)) {
        throw new Error('Unsupported provider');
      }
      this.catalogue.validate(record.target);
    } catch {
      return [{ issue: DeploymentIssue.Configuration, retryable: false }];
    }
    const publication = await this.publications.current(input.siteId);

    if (!publication) {
      return [{ issue: DeploymentIssue.NoPublication, retryable: false }];
    }

    return this.inspection.inspect(record.target, publication);
  }
}
