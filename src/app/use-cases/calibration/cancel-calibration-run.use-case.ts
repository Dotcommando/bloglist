import { requireInstallationAdministrator } from '../../../domain/admin-users/admin-user.policy.js';
import type { IGetCurrentAdminUser } from '../../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type { ICancelCalibrationRun } from '../../../ports/inbound/calibration/calibration-runs.port.js';
import type { CalibrationJobsService } from '../../services/calibration/calibration-jobs.service.js';

export class CancelCalibrationRunUseCase implements ICancelCalibrationRun {
  constructor(private readonly jobs: CalibrationJobsService, private readonly current: IGetCurrentAdminUser) {}

  async execute(input: Parameters<ICancelCalibrationRun['execute']>[0]): Promise<void> {
    requireInstallationAdministrator((await this.current.execute({ token: input.token })).user);
    await this.jobs.cancel(input.runId);
  }
}
