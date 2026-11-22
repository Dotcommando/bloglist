import { requireInstallationAdministrator } from '../../../domain/admin-users/admin-user.policy.js';
import { CalibrationScope } from '../../../domain/calibration/calibration-profile.js';
import { CalibrationRunStatus, type ICalibrationRun } from '../../../domain/calibration/calibration-run.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { IGetCurrentAdminUser } from '../../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type { IStartCalibrationRun } from '../../../ports/inbound/calibration/calibration-runs.port.js';
import type { ICalibrationProfilesPort, ICalibrationValuesPort } from
  '../../../ports/outbound/calibration/calibration-profiles.port.js';
import type { ICalibrationRunsPort } from '../../../ports/outbound/calibration/calibration-runs.port.js';
import type { ICalibrationLoadPort, ICalibrationPageResolverPort } from
  '../../../ports/outbound/calibration/calibration-runtime.port.js';
import type { IInstallationResourcesPort } from '../../../ports/outbound/resources/installation-resources.port.js';
import type { ISiteResourceCatalogPort } from '../../../ports/outbound/resources/site-resource-catalog.port.js';
import type { CalibrationJobsService } from '../../services/calibration/calibration-jobs.service.js';

export class StartCalibrationRunUseCase implements IStartCalibrationRun {
  constructor(private readonly profiles: ICalibrationProfilesPort, private readonly runs: ICalibrationRunsPort,
    private readonly current: IGetCurrentAdminUser, private readonly sites: ISiteResourceCatalogPort,
    private readonly resources: IInstallationResourcesPort, private readonly pages: ICalibrationPageResolverPort,
    private readonly load: ICalibrationLoadPort, private readonly jobs: CalibrationJobsService,
    private readonly values: ICalibrationValuesPort, private readonly cmsVersion: string) {}

  async execute(input: Parameters<IStartCalibrationRun['execute']>[0]): Promise<ICalibrationRun> {
    requireInstallationAdministrator((await this.current.execute({ token: input.token })).user);
    await this.jobs.flush();
    const profile = await this.profiles.get(input.profileId);

    if (!profile) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Calibration profile not found');
    }
    if (profile.version !== input.expectedVersion) {
      throw new BusinessError(BusinessErrorCode.StaleWrite, 'Calibration profile changed');
    }
    if (profile.scope !== CalibrationScope.Installation) {
      throw new BusinessError(BusinessErrorCode.Validation,
        'Save this legacy profile for all installation sites before CPU-budget calibration');
    }

    const sites = await this.sites.list();
    const state = await this.resources.read(sites.map(site => site.siteId));

    if (!this.resources.beginCalibration || state.activeDump || state.applyError) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Calibration is unavailable until resources are reconciled');
    }
    if (
      profile.scope === CalibrationScope.Installation
      && (!state.managed
      || !state.databasePools?.editable
      || this.load.sharesCmsBudget)
    ) {
      throw new BusinessError(BusinessErrorCode.Validation,
        'Full calibration requires Docker control and an external generator');
    }
    if (
      profile.distributedCpu > state.capacity - state.infrastructureCpu
      || profile.scope === CalibrationScope.Installation
      && profile.distributedCpu < 0.2
    ) {
      throw new BusinessError(BusinessErrorCode.Validation, 'Calibration budget exceeds available installation CPU');
    }

    const targets = await this.pages.resolve(profile, input.token);
    const siteIds = [...new Set(targets.filter(target => target.share > 0).map(target => target.siteId))];

    if (
      profile.scope === CalibrationScope.Installation
      && (siteIds.length !== sites.length
      || sites.some(site => !siteIds.includes(site.siteId)))
    ) {
      throw new BusinessError(BusinessErrorCode.Validation,
        'Installation calibration requires positive traffic for every site');
    }

    const lease = await this.resources.beginCalibration();
    const run: ICalibrationRun = {
      runId: this.values.nextId(),
      profile,
      siteIds,
      cmsVersion: this.cmsVersion,
      addonSnapshots: sites.map(site => ({ siteId: site.siteId, addons: site.addons ?? [] }))
        .sort((a, b) => a.siteId.localeCompare(b.siteId)),
      startedAt: this.values.now(),
      finishedAt: null,
      status: CalibrationRunStatus.Running,
      phase: 'Preparing',
      targets,
      original: lease.original,
      generatorPlacement: this.load.placement,
      referenceId: null,
      winnerId: null,
      restored: false,
      error: null,
    };

    try {
      await this.runs.create(run);
      this.jobs.start(run, lease);

      return run;
    } catch (error) {
      await lease.restore();
      throw error;
    }
  }
}
