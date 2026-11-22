import type { IAddonInstallation } from '../../../domain/addons/addon-installation.js';

/** Global installation metadata; site connections remain separate. */
export interface IAddonInstallationStore {
  findByRepository(repositoryUrl: string): Promise<IAddonInstallation | null>;
  list(): Promise<readonly IAddonInstallation[]>;
  /** Claims an immutable package identity; identical retries return the existing record. */
  reserve(candidate: IAddonInstallation): Promise<IAddonInstallation>;
  complete(installationId: string, runtimeDigest: string, installedAt: Date): Promise<IAddonInstallation>;
}
