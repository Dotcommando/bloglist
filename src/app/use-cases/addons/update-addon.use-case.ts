import { AddonUpdateMode, AddonUpdatePhase, type IAddonUpdateState } from '../../../domain/addons/addon-update.js';
import type { IUpdateAddon } from '../../../ports/inbound/addons/update-addon.port.js';
import type { IAddonUpdatesPort } from '../../../ports/outbound/addons/addon-updates.port.js';
import type { IAdminUserAccessPort } from '../../../ports/outbound/admin-users/admin-user-capabilities.port.js';

export class UpdateAddonUseCase implements IUpdateAddon {
  constructor(private readonly access: IAdminUserAccessPort, private readonly updates: IAddonUpdatesPort) {}

  async execute(input: { readonly updateId: string; readonly actorId: string }): Promise<IAddonUpdateState> {
    await this.access.requireAdministrator(input.actorId);
    const release = await this.updates.reserve();
    const failures: unknown[] = [];
    let result: IAddonUpdateState | undefined;

    try {
      const proposal = await this.updates.begin(input.updateId, input.actorId);

      if (proposal.phase === AddonUpdatePhase.Completed) {
        result = proposal;
      } else {
        try {
          let forced = 0;

          if (proposal.mode === AddonUpdateMode.Exclusive) {
            await this.updates.pause(proposal);
            forced += await this.updates.restart(proposal);
          }
          await this.updates.migrate(proposal);
          await this.updates.activate(proposal);
          forced += await this.updates.restart(proposal);
          result = await this.updates.complete(proposal, forced);
        } catch (error) {
          failures.push(error);

          try {
            await this.updates.fail(proposal);
          } catch (failure) {
            failures.push(failure);
          }
        }
      }
    } catch (error) {
      failures.push(error);
    }

    try {
      await release();
    } catch (error) {
      failures.push(error);
    }

    if (failures.length === 1) {
      throw failures[0];
    }
    if (failures.length) {
      throw new AggregateError(failures, 'Add-on update failed');
    }
    if (!result) {
      throw new Error('Add-on update has no result');
    }

    return result;
  }
}
