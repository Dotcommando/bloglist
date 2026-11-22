import type { IAddonUpdateProposal, IAddonUpdateState } from '../../../domain/addons/addon-update.js';

export interface IGetAddonUpdate {
  execute(input: { readonly actorId: string; readonly updateId: string }):
  Promise<IAddonUpdateState | IAddonUpdateProposal>;
}
