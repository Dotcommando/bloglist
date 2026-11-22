import type { IDeploymentPublication } from '../../../../domain/deployment/deployment.js';
import { BusinessError, BusinessErrorCode } from '../../../../domain/shared/business-error.js';
import { requireCondition } from '../../../../domain/shared/validation.js';
import type { IDeploymentPublicationPort } from '../../../../ports/outbound/deployment/deployment-publication.port.js';
import type { IHookGenerationPort } from '../../../../ports/outbound/hooks/hook-generation.port.js';
import type { IReleaseActivationPort } from '../../../../ports/outbound/publication/release-activation.port.js';

export class PublicationDeploymentSourceAdapter implements IDeploymentPublicationPort {
  constructor(private readonly activation: IReleaseActivationPort, private readonly generations: IHookGenerationPort) {}

  async current(siteId: string): Promise<IDeploymentPublication | null> {
    const generation = await this.generations.currentGeneration(siteId);
    const active = await this.activation.getActive(siteId);
    const checked = await this.generations.currentGeneration(siteId);

    if (checked !== generation) {
      throw new BusinessError(BusinessErrorCode.StaleWrite, 'Publication generation changed');
    }
    if (!active || !generation) {
      return null;
    }
    requireCondition(active.siteId === siteId, 'Foreign publication activation');

    return { releaseId: active.releaseId, generation };
  }
}
