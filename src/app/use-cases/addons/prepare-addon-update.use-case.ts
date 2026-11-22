import type { IAddonUpdateProposal } from '../../../domain/addons/addon-update.js';
import type { IBinaryContent } from '../../../domain/shared/binary-content.js';
import type { IPrepareAddonUpdate } from '../../../ports/inbound/addons/prepare-addon-update.port.js';
import type { IAddonUpdatePackagesPort } from '../../../ports/outbound/addons/addon-update-packages.port.js';
import type { IAdminUserAccessPort } from '../../../ports/outbound/admin-users/admin-user-capabilities.port.js';

export class PrepareAddonUpdateUseCase implements IPrepareAddonUpdate {
  constructor(private readonly access: IAdminUserAccessPort, private readonly packages: IAddonUpdatePackagesPort) {}

  async execute(input: { readonly actorId: string; readonly content: IBinaryContent }): Promise<IAddonUpdateProposal> {
    await this.access.requireAdministrator(input.actorId);

    return this.packages.prepareContent(input.content);
  }
}
