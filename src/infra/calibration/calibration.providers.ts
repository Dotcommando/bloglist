import { randomUUID } from 'node:crypto';

import type { Provider } from '@nestjs/common';
import type { Connection } from 'mongoose';

import type {
  ICalibrationRunOperations,
} from '../../adapters/inbound/rest/calibration/admin-calibration.controller.js';
import { AdminCalibrationController } from '../../adapters/inbound/rest/calibration/admin-calibration.controller.js';
import { MongooseCalibrationProfiles } from
  '../../adapters/outbound/persistence/mongoose/calibration/calibration-profiles.adapter.js';
import {
  DeleteCalibrationProfileUseCase,
  GetCalibrationProfileUseCase,
  ListCalibrationProfilesUseCase,
  UpdateCalibrationProfileUseCase,
} from '../../app/use-cases/calibration/calibration-profiles.use-case.js';
import {
  CreateCalibrationProfileUseCase,
} from '../../app/use-cases/calibration/create-calibration-profile.use-case.js';
import type { IGetCurrentAdminUser } from '../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type {
  ICreateCalibrationProfile, IDeleteCalibrationProfile, IGetCalibrationProfile, IListCalibrationProfiles,
  IUpdateCalibrationProfile,
} from '../../ports/inbound/calibration/calibration-profiles.port.js';
import type { ICalibrationProfilesPort, ICalibrationValuesPort } from
  '../../ports/outbound/calibration/calibration-profiles.port.js';
import type { ISiteResourceCatalogPort } from '../../ports/outbound/resources/site-resource-catalog.port.js';
import { GET_CURRENT_ADMIN_USER } from '../admin-auth/admin-auth.tokens.js';
import { MONGO_CONNECTION } from '../persistence/persistence.tokens.js';
import type { IPublicHttpSettings } from '../public-http.settings.js';
import { RESOURCE_SITE_CATALOG } from '../resources/resources.tokens.js';
import {
  CALIBRATION_OPERATIONS, CALIBRATION_PROFILES, CALIBRATION_VALUES, CREATE_CALIBRATION_PROFILE,
  DELETE_CALIBRATION_PROFILE, GET_CALIBRATION_PROFILE,
  LIST_CALIBRATION_PROFILES, UPDATE_CALIBRATION_PROFILE,
} from './calibration.tokens.js';
import { calibrationRunProviders } from './calibration-run.providers.js';

export function calibrationProviders(
  settings: Pick<IPublicHttpSettings, 'adminAuth' | 'installationResources' | 'calibrationLoad'>,
): Provider[] {
  if (!settings.installationResources) {
    return [];
  }

  return [
    ...calibrationRunProviders(settings),
    {
      provide: CALIBRATION_PROFILES,
      inject: [MONGO_CONNECTION],
      useFactory: (connection: Connection) => new MongooseCalibrationProfiles(connection),
    },
    { provide: CALIBRATION_VALUES, useValue: { now: () => new Date(), nextId: randomUUID, nextVersion: randomUUID } },
    {
      provide: CREATE_CALIBRATION_PROFILE,
      inject: [CALIBRATION_PROFILES, GET_CURRENT_ADMIN_USER, RESOURCE_SITE_CATALOG, CALIBRATION_VALUES],
      useFactory: (profiles: ICalibrationProfilesPort, current: IGetCurrentAdminUser,
        sites: ISiteResourceCatalogPort, values: ICalibrationValuesPort) =>
        new CreateCalibrationProfileUseCase(profiles, current, sites, values),
    },
    {
      provide: GET_CALIBRATION_PROFILE,
      inject: [CALIBRATION_PROFILES, GET_CURRENT_ADMIN_USER],
      useFactory: (profiles: ICalibrationProfilesPort, current: IGetCurrentAdminUser) =>
        new GetCalibrationProfileUseCase(profiles, current),
    },
    {
      provide: LIST_CALIBRATION_PROFILES,
      inject: [CALIBRATION_PROFILES, GET_CURRENT_ADMIN_USER],
      useFactory: (profiles: ICalibrationProfilesPort, current: IGetCurrentAdminUser) =>
        new ListCalibrationProfilesUseCase(profiles, current),
    },
    {
      provide: UPDATE_CALIBRATION_PROFILE,
      inject: [CALIBRATION_PROFILES, GET_CURRENT_ADMIN_USER, RESOURCE_SITE_CATALOG, CALIBRATION_VALUES],
      useFactory: (profiles: ICalibrationProfilesPort, current: IGetCurrentAdminUser,
        sites: ISiteResourceCatalogPort, values: ICalibrationValuesPort) =>
        new UpdateCalibrationProfileUseCase(profiles, current, sites, values),
    },
    {
      provide: DELETE_CALIBRATION_PROFILE,
      inject: [CALIBRATION_PROFILES, GET_CURRENT_ADMIN_USER, CALIBRATION_VALUES],
      useFactory: (profiles: ICalibrationProfilesPort, current: IGetCurrentAdminUser, values: ICalibrationValuesPort) =>
        new DeleteCalibrationProfileUseCase(profiles, current, values),
    },
    ...(settings.adminAuth ? [{
      provide: AdminCalibrationController,
      inject: [GET_CURRENT_ADMIN_USER, CREATE_CALIBRATION_PROFILE, GET_CALIBRATION_PROFILE,
        LIST_CALIBRATION_PROFILES, UPDATE_CALIBRATION_PROFILE, DELETE_CALIBRATION_PROFILE, CALIBRATION_OPERATIONS],
      useFactory: (current: IGetCurrentAdminUser, create: ICreateCalibrationProfile, get: IGetCalibrationProfile,
        list: IListCalibrationProfiles, update: IUpdateCalibrationProfile, remove: IDeleteCalibrationProfile,
        operations: ICalibrationRunOperations | null) =>
        new AdminCalibrationController(settings.adminAuth!, current, create, get, list, update, remove, operations),
    }] : []),
  ];
}
