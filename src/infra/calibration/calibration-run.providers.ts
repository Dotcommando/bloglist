import { readFileSync } from 'node:fs';

import type { Provider } from '@nestjs/common';
import type { Connection } from 'mongoose';

import type { IAdminContentOperationFactory } from
  '../../adapters/inbound/rest/content/admin-content-operations.factory.js';
import type { IAdminRoutingOperationFactory } from
  '../../adapters/inbound/rest/routing/admin-routing-operations.factory.js';
import { CalibrationPageResolver } from
  '../../adapters/outbound/capabilities/calibration/calibration-page-resolver.adapter.js';
import { MongooseCalibrationRuns } from
  '../../adapters/outbound/persistence/mongoose/calibration/calibration-runs.adapter.js';
import { CalibrationJobsService } from '../../app/services/calibration/calibration-jobs.service.js';
import { CalibrationSearchService } from '../../app/services/calibration/calibration-search.service.js';
import { ApplyCalibrationResultUseCase } from '../../app/use-cases/calibration/apply-calibration-result.use-case.js';
import { CancelCalibrationRunUseCase } from '../../app/use-cases/calibration/cancel-calibration-run.use-case.js';
import { ReadCalibrationRunsUseCase } from '../../app/use-cases/calibration/read-calibration-runs.use-case.js';
import { StartCalibrationRunUseCase } from '../../app/use-cases/calibration/start-calibration-run.use-case.js';
import type { IGetCurrentAdminUser } from '../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type { ICalibrationProfilesPort, ICalibrationValuesPort } from
  '../../ports/outbound/calibration/calibration-profiles.port.js';
import type { ICalibrationRunsPort } from '../../ports/outbound/calibration/calibration-runs.port.js';
import type { ICalibrationPageResolverPort } from '../../ports/outbound/calibration/calibration-runtime.port.js';
import type { IInstallationResourcesPort } from '../../ports/outbound/resources/installation-resources.port.js';
import type { ISiteResourceCatalogPort } from '../../ports/outbound/resources/site-resource-catalog.port.js';
import { GET_CURRENT_ADMIN_USER } from '../admin-auth/admin-auth.tokens.js';
import { ADMIN_CONTENT_OPERATIONS } from '../content/content.tokens.js';
import { MONGO_CONNECTION } from '../persistence/persistence.tokens.js';
import type { IPublicHttpSettings } from '../public-http.settings.js';
import { INSTALLATION_RESOURCES, RESOURCE_SITE_CATALOG } from '../resources/resources.tokens.js';
import { ADMIN_ROUTING_OPERATIONS } from '../routing/routing.tokens.js';
import {
  CALIBRATION_JOBS, CALIBRATION_OPERATIONS, CALIBRATION_PAGES, CALIBRATION_PROFILES, CALIBRATION_RUNS,
  CALIBRATION_VALUES,
} from './calibration.tokens.js';

function cmsVersion(): string {
  const metadata: unknown = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));

  if (!metadata || typeof metadata !== 'object' || !('version' in metadata) || typeof metadata.version !== 'string') {
    throw new Error('CMS package version unavailable');
  }

  return metadata.version;
}

export function calibrationRunProviders(settings: Pick<IPublicHttpSettings, 'calibrationLoad'>): Provider[] {
  const load = settings.calibrationLoad;

  if (!load) {
    return [{ provide: CALIBRATION_OPERATIONS, useValue: null }];
  }

  return [
    {
      provide: CALIBRATION_RUNS,
      inject: [MONGO_CONNECTION],
      useFactory: (connection: Connection) => new MongooseCalibrationRuns(connection),
    },
    {
      provide: CALIBRATION_PAGES,
      inject: [ADMIN_CONTENT_OPERATIONS, ADMIN_ROUTING_OPERATIONS, RESOURCE_SITE_CATALOG],
      useFactory: (content: IAdminContentOperationFactory, routing: IAdminRoutingOperationFactory,
        sites: ISiteResourceCatalogPort) =>
        new CalibrationPageResolver(token => ({
          site: content.forSession(token).getSite,
          pages: content.forSession(token).listPages,
          catalog: routing.forSession(token).catalog,
        }), sites),
    },
    {
      provide: CALIBRATION_JOBS,
      inject: [CALIBRATION_RUNS, CALIBRATION_VALUES, RESOURCE_SITE_CATALOG],
      useFactory: (runs: ICalibrationRunsPort, values: ICalibrationValuesPort, sites: ISiteResourceCatalogPort) =>
        new CalibrationJobsService(new CalibrationSearchService(runs, load, values, sites), runs),
    },
    {
      provide: CALIBRATION_OPERATIONS,
      inject: [CALIBRATION_PROFILES, CALIBRATION_RUNS, GET_CURRENT_ADMIN_USER, RESOURCE_SITE_CATALOG,
        INSTALLATION_RESOURCES, CALIBRATION_PAGES, CALIBRATION_JOBS, CALIBRATION_VALUES],
      useFactory: (profiles: ICalibrationProfilesPort, runs: ICalibrationRunsPort, current: IGetCurrentAdminUser,
        sites: ISiteResourceCatalogPort, resources: IInstallationResourcesPort, pages: ICalibrationPageResolverPort,
        jobs: CalibrationJobsService, values: ICalibrationValuesPort) => ({
        start: new StartCalibrationRunUseCase(profiles, runs, current, sites, resources, pages,
          load, jobs, values, cmsVersion()),
        read: new ReadCalibrationRunsUseCase(runs, current, jobs),
        cancel: new CancelCalibrationRunUseCase(jobs, current),
        apply: new ApplyCalibrationResultUseCase(runs, resources, sites, current),
        full: !load.sharesCmsBudget,
      }),
    },
  ];
}
