import { requireInstallationAdministrator } from '../../../domain/admin-users/admin-user.policy.js';
import { CalibrationScope } from '../../../domain/calibration/calibration-profile.js';
import { CalibrationMeasurementKind, CalibrationRunStatus } from '../../../domain/calibration/calibration-run.js';
import type { IInstallationResourceState } from '../../../domain/resources/installation-resources.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { IGetCurrentAdminUser } from '../../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type { IApplyCalibrationResult } from '../../../ports/inbound/calibration/calibration-runs.port.js';
import type { ICalibrationRunsPort } from '../../../ports/outbound/calibration/calibration-runs.port.js';
import type { IInstallationResourcesPort } from '../../../ports/outbound/resources/installation-resources.port.js';
import type { ISiteResourceCatalogPort } from '../../../ports/outbound/resources/site-resource-catalog.port.js';

export class ApplyCalibrationResultUseCase implements IApplyCalibrationResult {
  constructor(private readonly runs: ICalibrationRunsPort, private readonly resources: IInstallationResourcesPort,
    private readonly sites: ISiteResourceCatalogPort, private readonly current: IGetCurrentAdminUser) {}

  async execute(input: Parameters<IApplyCalibrationResult['execute']>[0]): Promise<IInstallationResourceState> {
    requireInstallationAdministrator((await this.current.execute({ token: input.token })).user);
    const run = await this.runs.get(input.runId);

    if (run?.status !== CalibrationRunStatus.Completed || !run.restored || !run.winnerId) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'No confirmed and restored recommendation');
    }

    const winner = (await this.runs.measurements(run.runId)).find(m => m.measurementId === run.winnerId && m.passed);
    const sites = await this.sites.list();
    const ids = sites.map(site => site.siteId);
    const addons = sites.filter(site => run.siteIds.includes(site.siteId))
      .map(site => ({ siteId: site.siteId, addons: site.addons ?? [] }))
      .sort((a, b) => a.siteId.localeCompare(b.siteId));

    if (!run.addonSnapshots || JSON.stringify(run.addonSnapshots) !== JSON.stringify(addons)) {
      throw new BusinessError(BusinessErrorCode.StaleWrite, 'Add-on composition changed; repeat calibration');
    }

    const state = await this.resources.read(ids);
    const full = run.profile.scope === CalibrationScope.Installation;

    if (
      winner?.kind !== CalibrationMeasurementKind.Confirmation
      || input.expectedVersion !== state.version
      || state.activeDump
      || !ids.includes(run.profile.siteId ?? '')
      && !full
      || full
      && (!state.managed
      || ids.length !== run.siteIds.length
      || ids.some(id => !run.siteIds.includes(id)))
    ) {
      throw new BusinessError(BusinessErrorCode.StaleWrite, 'Resources or installation topology changed');
    }
    await this.resources.change({
      expectedVersion: state.version,
      databaseCpu: full ? winner.configuration.databaseCpu : state.databaseCpu,
      ...(full ? { cmsCpu: winner.configuration.cmsCpu, sitePoolSize: winner.configuration.sitePoolSize } : {}),
      sites: state.sites.map(site => full || site.siteId === run.profile.siteId
        ? winner.configuration.sites.find(entry => entry.siteId === site.siteId) ?? site : site),
    });

    return this.resources.read(ids);
  }
}
