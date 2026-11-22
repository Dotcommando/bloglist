import type { IAddonUpdateProposal, IAddonUpdateState } from '../../../domain/addons/addon-update.js';
import type { IGetAddonUpdate } from '../../../ports/inbound/addons/get-addon-update.port.js';
import type { IAddonUpdatePackagesPort } from '../../../ports/outbound/addons/addon-update-packages.port.js';
import type { IAdminUserAccessPort } from '../../../ports/outbound/admin-users/admin-user-capabilities.port.js';

export class GetAddonUpdateUseCase implements IGetAddonUpdate {
  constructor(private readonly access: IAdminUserAccessPort, private readonly packages: IAddonUpdatePackagesPort) {}

  async execute(input: { readonly actorId: string; readonly updateId: string }):
  Promise<IAddonUpdateState | IAddonUpdateProposal> {
    await this.access.requireAdministrator(input.actorId);

    return this.packages.status(input.updateId);
  }
}
