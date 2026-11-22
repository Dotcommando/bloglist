import { requireInstallationAdministrator } from '../../../domain/admin-users/admin-user.policy.js';
import type { ICalibrationProfile } from '../../../domain/calibration/calibration-profile.js';
import { normalizeCalibrationDraft } from '../../../domain/calibration/calibration-profile.policy.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { IGetCurrentAdminUser } from '../../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type { ICreateCalibrationProfile } from '../../../ports/inbound/calibration/calibration-profiles.port.js';
import type {
  ICalibrationProfilesPort,
  ICalibrationValuesPort,
} from '../../../ports/outbound/calibration/calibration-profiles.port.js';
import type { ISiteResourceCatalogPort } from '../../../ports/outbound/resources/site-resource-catalog.port.js';

export class CreateCalibrationProfileUseCase implements ICreateCalibrationProfile {
  constructor(private readonly profiles: ICalibrationProfilesPort, private readonly current: IGetCurrentAdminUser,
    private readonly sites: ISiteResourceCatalogPort, private readonly values: ICalibrationValuesPort) {}

  async execute(input: Parameters<ICreateCalibrationProfile['execute']>[0]): Promise<ICalibrationProfile> {
    requireInstallationAdministrator((await this.current.execute({ token: input.token })).user);
    const draft = normalizeCalibrationDraft(input.draft);
    const sites = await this.sites.list();

    if (draft.targets.some(target => !sites.some(site => site.siteId === target.siteId))) {
      throw new BusinessError(BusinessErrorCode.Validation, 'Unknown calibration site');
    }

    const now = this.values.now();
    const profile: ICalibrationProfile = {
      ...draft,
      profileId: this.values.nextId(),
      version: this.values.nextVersion(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    await this.profiles.create(profile);

    return profile;
  }
}
