import { requireInstallationAdministrator } from '../../../domain/admin-users/admin-user.policy.js';
import type { ICalibrationMeasurement, ICalibrationRun } from '../../../domain/calibration/calibration-run.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { IGetCurrentAdminUser } from '../../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type { IReadCalibrationRuns } from '../../../ports/inbound/calibration/calibration-runs.port.js';
import type { ICalibrationRunsPort } from '../../../ports/outbound/calibration/calibration-runs.port.js';
import type { CalibrationJobsService } from '../../services/calibration/calibration-jobs.service.js';

export class ReadCalibrationRunsUseCase implements IReadCalibrationRuns {
  constructor(private readonly runs: ICalibrationRunsPort, private readonly current: IGetCurrentAdminUser,
    private readonly jobs: CalibrationJobsService) {}

  async execute(input: Parameters<IReadCalibrationRuns['execute']>[0]): Promise<readonly ICalibrationRun[]> {
    requireInstallationAdministrator((await this.current.execute({ token: input.token })).user);
    await this.jobs.flush();

    return this.runs.latest(input.siteId, 10);
  }

  async detail(input: Parameters<IReadCalibrationRuns['detail']>[0]):
  Promise<{ run: ICalibrationRun; measurements: readonly ICalibrationMeasurement[] }> {
    requireInstallationAdministrator((await this.current.execute({ token: input.token })).user);
    await this.jobs.flush();
    const run = await this.runs.get(input.runId);

    if (!run) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Calibration run not found');
    }

    return { run, measurements: await this.runs.measurements(run.runId) };
  }
}
