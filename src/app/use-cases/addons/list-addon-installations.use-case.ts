import type { IAddonInstallation } from '../../../domain/addons/addon-installation.js';
import type {
  IListAddonInstallations, IListAddonInstallationsInput,
} from '../../../ports/inbound/addons/list-addon-installations.port.js';
import type { IAddonInstallationStore } from '../../../ports/outbound/addons/addon-installation-store.port.js';
import type { ISiteAddonAccessPort } from '../../../ports/outbound/addons/site-addon-access.port.js';

export class ListAddonInstallationsUseCase implements IListAddonInstallations {
  constructor(private readonly store: IAddonInstallationStore, private readonly access: ISiteAddonAccessPort) {}

  async execute(input: IListAddonInstallationsInput): Promise<readonly IAddonInstallation[]> {
    await this.access.requireAdministrator(input.siteId, input.actorId);

    return this.store.list();
  }
}
