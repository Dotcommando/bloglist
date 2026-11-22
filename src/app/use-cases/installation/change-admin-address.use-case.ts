import { requireInstallationAdministrator } from '../../../domain/admin-users/admin-user.policy.js';
import {
  adminAddressOrigin, type IInstallationSettings,
} from '../../../domain/installation/installation-settings.js';
import {
  BusinessError, BusinessErrorCode,
} from '../../../domain/shared/business-error.js';
import type {
  IGetCurrentAdminUser,
} from '../../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type {
  IChangeAdminAddress,
} from '../../../ports/inbound/installation/installation-settings.port.js';
import type {
  IAdminAddressReachabilityPort, IInstallationSettingsStore,
} from '../../../ports/outbound/installation/installation-settings-store.port.js';

export class ChangeAdminAddressUseCase implements IChangeAdminAddress {
  constructor(private readonly store: IInstallationSettingsStore, private readonly current: IGetCurrentAdminUser,
    private readonly reachability: IAdminAddressReachabilityPort) {}

  async execute(input: Parameters<IChangeAdminAddress['execute']>[0]): Promise<IInstallationSettings> {
    requireInstallationAdministrator((await this.current.execute({ token: input.token })).user);
    const origin = adminAddressOrigin(input.adminAddress);
    const settings = await this.store.read();

    if (settings.version !== input.expectedVersion) {
      throw new BusinessError(BusinessErrorCode.StaleWrite, 'Installation settings changed');
    }
    if (origin === settings.adminOrigin) {
      return settings;
    }
    await this.reachability.verify(origin);
    // A slow network check must not preserve authority after logout or account changes.
    requireInstallationAdministrator((await this.current.execute({ token: input.token })).user);

    return this.store.changeAdminOrigin(origin, input.expectedVersion);
  }
}
