import { createHash } from 'node:crypto';

import type { ISiteAddonStorePort } from '../../../../ports/outbound/addons/site-addon-store.port.js';
import type { ISiteResourceCatalogPort } from '../../../../ports/outbound/resources/site-resource-catalog.port.js';
import type { ISiteRepository } from '../../../../ports/outbound/sites/site.repository.js';
import type { AddonPackageRegistry } from '../../runtime/addons/addon-package-registry.js';

export class CalibrationAddonCatalog implements ISiteResourceCatalogPort {
  constructor(private readonly sites: ISiteRepository, private readonly addons: ISiteAddonStorePort,
    private readonly packages: AddonPackageRegistry) {}

  async list(): ReturnType<ISiteResourceCatalogPort['list']> {
    const registrations = this.packages.registrations();

    return Promise.all((await this.sites.findAll()).map(async site => ({
      siteId: site.siteId,
      name: site.name,
      primaryDomain: site.primaryDomain,
      addons: (await this.addons.list(site.siteId)).filter(addon => addon.status === 'Enabled')
        .sort((a, b) => a.addonKey.localeCompare(b.addonKey)).map(addon => {
          const registration = registrations.find(item => item.definition.addonKey === addon.addonKey);
          const runtime = this.packages.runtime(addon.addonKey);

          if (!registration || !runtime) {
            throw new Error('Enabled add-on runtime unavailable for calibration');
          }

          return {
            addonKey: addon.addonKey,
            implementationVersion: registration.definition.implementationVersion,
            runtimeDigest: runtime.digest,
            configurationHash: createHash('sha256').update(JSON.stringify(addon.configuration)).digest('hex'),
            queries: registration.transfer?.calibrationQueries ?? [],
          };
        }),
    })));
  }
}
