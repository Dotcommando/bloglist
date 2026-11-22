import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { AddonShutdownReason } from '@zarya/addon-contracts/addons';

import type { AddonPackageRegistry } from '../../adapters/outbound/runtime/addons/addon-package-registry.js';
import { ProcessCalibrationLoad }
  from '../../adapters/outbound/runtime/calibration/calibration-load.adapter.js';
import { HelperCalibrationLoad }
  from '../../adapters/outbound/runtime/calibration/helper-calibration-load.adapter.js';
import { ControlResourcesClient } from '../../adapters/outbound/runtime/processes/control-resources-process.js';
import type { CalibrationJobsService } from '../../app/services/calibration/calibration-jobs.service.js';
import { ADDON_PACKAGE_REGISTRY } from '../addons/addons.tokens.js';
import { CALIBRATION_JOBS } from '../calibration/calibration.tokens.js';
import { createPublicHttpApplication } from '../public-http.application.js';
import type { IPublicHttpSettings } from '../public-http.settings.js';

let application: INestApplication<Server> | null = null;

let stopping = false;

let administrative = false;

let activated = false;

async function stop(addonKey?: string, deadlineAt?: string): Promise<void> {
  if (stopping) {
    return;
  }
  stopping = true;

  try {
    if (application) {
      if (addonKey) {
        await application.get<AddonPackageRegistry>(ADDON_PACKAGE_REGISTRY).shutdown(addonKey, {
          reason: AddonShutdownReason.Update,
          deadlineAt: Date.parse(deadlineAt ?? ''),
        });
      }
      if (administrative) {
        await application.get<CalibrationJobsService>(CALIBRATION_JOBS).onModuleDestroy();
      }
      await new Promise<void>((resolve, reject) => {
        const server = application!.getHttpServer();

        server.close((error) => error ? reject(error) : resolve());
        server.closeIdleConnections();
      });
      await application.close();
    }
    process.exitCode = 0;
  } catch {
    process.exitCode = 1;
  } finally {
    process.disconnect?.();
  }
}

process.once('disconnect', () => {
  if (!stopping) {
    process.exit(1);
  }
});

process.on('message', (value: unknown) => {
  if (!value || typeof value !== 'object' || !('kind' in value)) {
    return;
  }
  if (
    value.kind === 'prepare-update'
    && application
    && 'addonKey' in value
    && typeof value.addonKey === 'string'
  ) {
    void application.get<AddonPackageRegistry>(ADDON_PACKAGE_REGISTRY).notifyShutdown(value.addonKey, {
      reason: AddonShutdownReason.Update,
      deadlineAt: 'deadlineAt' in value && typeof value.deadlineAt === 'string' ? Date.parse(value.deadlineAt) : NaN,
    }).catch(() => {
      process.exitCode = 1;
    });
  } else if (value.kind === 'drain') {
    void stop('addonKey' in value && typeof value.addonKey === 'string' ? value.addonKey : undefined,
      'deadlineAt' in value && typeof value.deadlineAt === 'string' ? value.deadlineAt : undefined);
  } else if (value.kind === 'activate' && application && administrative && !stopping && !activated) {
    activated = true;
    void application.get<CalibrationJobsService>(CALIBRATION_JOBS).recover().catch(() => {
      process.exitCode = 1;
      process.disconnect?.();
    });
  }
});

try {
  if (!process.send || !process.env.ZARYA_PROCESS_BOOTSTRAP) {
    throw new Error('Private control worker bootstrap required');
  }

  const settings: IPublicHttpSettings = JSON.parse(process.env.ZARYA_PROCESS_BOOTSTRAP);
  const helper: { socket?: string; secret?: string } = JSON.parse(process.env.ZARYA_CONTROL_HELPER ?? '{}');
  const standby = process.env.ZARYA_CONTROL_STANDBY === '1';

  administrative = !!settings.adminAuth;
  activated = !standby;

  delete process.env.ZARYA_PROCESS_BOOTSTRAP;
  delete process.env.ZARYA_CONTROL_HELPER;
  application = await createPublicHttpApplication({
    ...settings,
    host: '127.0.0.1',
    port: 0,
    coordinatorOnly: false,
    backgroundWork: true,
    installationResources: new ControlResourcesClient(),
    calibrationLoad: helper.socket && helper.secret ? new HelperCalibrationLoad(helper.socket, helper.secret)
      : new ProcessCalibrationLoad(() => 'http://127.0.0.1:' + settings.port),
  });

  if (!standby && administrative) {
    await application.get<CalibrationJobsService>(CALIBRATION_JOBS).recover();
  }

  const address = application.getHttpServer().address();

  if (!address || typeof address === 'string') {
    throw new Error('Control worker address unavailable');
  }
  process.send({
    kind: 'ready', port: address.port, databasePoolSize: settings.mongoPoolSize ?? 5,
  }, (error: Error | null) => {
    if (error) {
      void stop();
    }
  });
} catch {
  await application?.close();
  process.exitCode = 1;
  process.disconnect?.();
}
