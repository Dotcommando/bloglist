import type { IAddonUpdateProposal } from '../../../domain/addons/addon-update.js';

export type AddonRepositoryUpdate = { readonly status: 'NoRepository' | 'Current' }
  | { readonly status: 'Available'; readonly update: IAddonUpdateProposal };

export interface ICheckAddonRepositoryUpdate {
  execute(input: { readonly actorId: string; readonly addonKey: string }): Promise<AddonRepositoryUpdate>;
}
