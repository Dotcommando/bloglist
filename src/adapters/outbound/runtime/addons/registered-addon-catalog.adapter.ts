import type { IAddonConfiguration, IAddonDefinition } from '../../../../domain/addons/site-addon.js';
import { BusinessError, BusinessErrorCode } from '../../../../domain/shared/business-error.js';
import type { IAddonCatalogPort } from '../../../../ports/outbound/addons/addon-catalog.port.js';
import type { AddonPackageRegistry } from './addon-package-registry.js';

export class RegisteredAddonCatalogAdapter implements IAddonCatalogPort {
  constructor(private readonly packages: Pick<AddonPackageRegistry, 'registrations'>) {}

  list(): readonly IAddonDefinition[] {
    return this.packages.registrations().map(addon => addon.definition);
  }

  find(key: string): IAddonDefinition | null {
    return this.packages.registrations().find(addon => addon.definition.addonKey === key)?.definition ?? null;
  }

  validate(key: string, configuration: IAddonConfiguration): void {
    const addon = this.packages.registrations().find(item => item.definition.addonKey === key);

    if (!addon) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Add-on not registered');
    }
    addon.validate(configuration);
  }
}
