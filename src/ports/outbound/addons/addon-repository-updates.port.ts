import type { IAddonUpdateProposal } from '../../../domain/addons/addon-update.js';

export interface IAddonRepositoryUpdatesPort {
  prepareLatest(repositoryUrl: string, addonKey: string): Promise<IAddonUpdateProposal | null>;
}
