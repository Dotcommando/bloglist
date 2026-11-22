import { AddonInstallationStatus } from '../../../domain/addons/addon-installation.js';
import type { AddonRepositoryUpdate, ICheckAddonRepositoryUpdate }
  from '../../../ports/inbound/addons/check-addon-repository-update.port.js';
import type { IAddonInstallationStore } from '../../../ports/outbound/addons/addon-installation-store.port.js';
import type { IAddonRepositoryUpdatesPort } from '../../../ports/outbound/addons/addon-repository-updates.port.js';
import type { IAdminUserAccessPort } from '../../../ports/outbound/admin-users/admin-user-capabilities.port.js';

export class CheckAddonRepositoryUpdateUseCase implements ICheckAddonRepositoryUpdate {
  constructor(private readonly access: IAdminUserAccessPort,
    private readonly store: Pick<IAddonInstallationStore, 'list'>,
    private readonly updates: IAddonRepositoryUpdatesPort) {}

  async execute(input: { readonly actorId: string; readonly addonKey: string }): Promise<AddonRepositoryUpdate> {
    await this.access.requireAdministrator(input.actorId);
    const installation = (await this.store.list()).find(item => item.addonKey === input.addonKey
      && item.status === AddonInstallationStatus.Installed);

    if (!installation) {
      return { status: 'NoRepository' };
    }

    const update = await this.updates.prepareLatest(installation.repositoryUrl, input.addonKey);

    return update ? { status: 'Available', update } : { status: 'Current' };
  }
}
