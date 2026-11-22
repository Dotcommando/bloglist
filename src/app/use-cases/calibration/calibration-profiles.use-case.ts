import { requireInstallationAdministrator } from '../../../domain/admin-users/admin-user.policy.js';
import type { ICalibrationProfile, ICalibrationProfilePage } from '../../../domain/calibration/calibration-profile.js';
import { normalizeCalibrationDraft } from '../../../domain/calibration/calibration-profile.policy.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { IGetCurrentAdminUser } from '../../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type {
  IDeleteCalibrationProfile,
  IGetCalibrationProfile,
  IListCalibrationProfiles,
  IUpdateCalibrationProfile,
} from
  '../../../ports/inbound/calibration/calibration-profiles.port.js';
import type { ICalibrationProfilesPort, ICalibrationValuesPort } from
  '../../../ports/outbound/calibration/calibration-profiles.port.js';
import type { ISiteResourceCatalogPort } from '../../../ports/outbound/resources/site-resource-catalog.port.js';

export class GetCalibrationProfileUseCase implements IGetCalibrationProfile {
  constructor(private readonly profiles: ICalibrationProfilesPort, private readonly current: IGetCurrentAdminUser) {}

  async execute(input: Parameters<IGetCalibrationProfile['execute']>[0]): Promise<ICalibrationProfile> {
    requireInstallationAdministrator((await this.current.execute({ token: input.token })).user);
    const profile = await this.profiles.get(input.profileId);

    if (!profile) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Calibration profile not found');
    }

    return profile;
  }
}

export class ListCalibrationProfilesUseCase implements IListCalibrationProfiles {
  constructor(private readonly profiles: ICalibrationProfilesPort, private readonly current: IGetCurrentAdminUser) {}

  async execute(input: Parameters<IListCalibrationProfiles['execute']>[0]): Promise<ICalibrationProfilePage> {
    requireInstallationAdministrator((await this.current.execute({ token: input.token })).user);

    if (
      !Number.isSafeInteger(input.limit)
      || input.limit < 1
      || input.limit > 100
      || input.cursor !== null
      && input.cursor.length > 128
      || input.siteId !== null
      && input.siteId.length > 128
    ) {
      throw new BusinessError(BusinessErrorCode.Validation, 'Invalid calibration pagination');
    }

    return this.profiles.list({ siteId: input.siteId, cursor: input.cursor, limit: input.limit });
  }
}

export class UpdateCalibrationProfileUseCase implements IUpdateCalibrationProfile {
  constructor(private readonly profiles: ICalibrationProfilesPort, private readonly current: IGetCurrentAdminUser,
    private readonly sites: ISiteResourceCatalogPort, private readonly values: ICalibrationValuesPort) {}

  async execute(input: Parameters<IUpdateCalibrationProfile['execute']>[0]): Promise<ICalibrationProfile> {
    requireInstallationAdministrator((await this.current.execute({ token: input.token })).user);
    const previous = await this.profiles.get(input.profileId);

    if (!previous) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Calibration profile not found');
    }
    if (previous.version !== input.expectedVersion) {
      throw new BusinessError(BusinessErrorCode.StaleWrite, 'Calibration profile changed');
    }

    const draft = normalizeCalibrationDraft(input.draft);
    const sites = await this.sites.list();

    if (draft.targets.some(target => !sites.some(site => site.siteId === target.siteId))) {
      throw new BusinessError(BusinessErrorCode.Validation, 'Unknown calibration site');
    }

    const profile = { ...previous, ...draft, version: this.values.nextVersion(), updatedAt: this.values.now() };

    await this.profiles.replace(profile, input.expectedVersion);

    return profile;
  }
}

export class DeleteCalibrationProfileUseCase implements IDeleteCalibrationProfile {
  constructor(private readonly profiles: ICalibrationProfilesPort, private readonly current: IGetCurrentAdminUser,
    private readonly values: ICalibrationValuesPort) {}

  async execute(input: Parameters<IDeleteCalibrationProfile['execute']>[0]): Promise<void> {
    requireInstallationAdministrator((await this.current.execute({ token: input.token })).user);
    await this.profiles.remove(input.profileId, input.expectedVersion, this.values.now());
  }
}
