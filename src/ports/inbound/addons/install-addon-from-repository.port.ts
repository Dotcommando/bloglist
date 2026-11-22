import type { IAddonInstallation } from '../../../domain/addons/addon-installation.js';

export interface IInstallAddonFromRepositoryInput {
  readonly actorId: string;
  readonly siteId: string;
  readonly repositoryUrl: string;
  readonly installedAddonKey?: string;
}

export interface IInstallAddonFromRepository {
  execute(input: IInstallAddonFromRepositoryInput): Promise<IAddonInstallation>;
}
