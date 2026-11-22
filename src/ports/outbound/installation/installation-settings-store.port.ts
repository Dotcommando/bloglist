import type { IInstallationSettings } from '../../../domain/installation/installation-settings.js';

export interface IInstallationSettingsStore {
  read(): Promise<IInstallationSettings>;
  changeAdminOrigin(origin: string, expectedVersion: string): Promise<IInstallationSettings>;
}

export interface IAdminAddressReachabilityPort {
  /** Proves HTTPS delivery of this installation's administration through the candidate origin. */
  verify(origin: string): Promise<void>;
}
