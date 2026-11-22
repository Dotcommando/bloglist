import type { IDeploymentTarget } from '../../../domain/deployment/deployment.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { IDeploymentProviderCataloguePort } from '../../../ports/outbound/deployment/deployment-provider.port.js';

export class DeploymentProviderCatalogueAdapter implements IDeploymentProviderCataloguePort {
  constructor(private readonly validators: ReadonlyMap<string, (target: IDeploymentTarget) => void>) {}

  supports(providerKey: string): boolean {
    return this.validators.has(providerKey);
  }

  validate(target: IDeploymentTarget): void {
    const validate = this.validators.get(target.providerKey);

    if (!validate) {
      throw new BusinessError(BusinessErrorCode.Validation, 'Unsupported deployment provider');
    }
    validate(target);
  }
}
