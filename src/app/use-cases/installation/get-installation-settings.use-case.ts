import { requireInstallationAdministrator } from '../../../domain/admin-users/admin-user.policy.js';
import type {
  IInstallationSettings,
} from '../../../domain/installation/installation-settings.js';
import type {
  IAdminSessionInput,
} from '../../../ports/inbound/admin-auth/admin-session.dto.js';
import type {
  IGetCurrentAdminUser,
} from '../../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type {
  IGetInstallationSettings,
} from '../../../ports/inbound/installation/installation-settings.port.js';
import type {
  IInstallationSettingsStore,
} from '../../../ports/outbound/installation/installation-settings-store.port.js';

export class GetInstallationSettingsUseCase implements IGetInstallationSettings {
  constructor(private readonly store: IInstallationSettingsStore, private readonly current: IGetCurrentAdminUser) {}

  async execute(input: IAdminSessionInput): Promise<IInstallationSettings> {
    requireInstallationAdministrator((await this.current.execute(input)).user);

    return this.store.read();
  }
}
