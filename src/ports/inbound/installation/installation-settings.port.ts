import type { IInstallationSettings } from '../../../domain/installation/installation-settings.js';
import type { IAdminSessionInput } from '../admin-auth/admin-session.dto.js';

export interface IGetInstallationSettings {
  execute(input: IAdminSessionInput): Promise<IInstallationSettings>;
}

export interface IChangeAdminAddress {
  execute(input: IAdminSessionInput & {
    readonly adminAddress: string;
    readonly expectedVersion: string;
  }): Promise<IInstallationSettings>;
}
