import type { Provider } from '@nestjs/common';

import { PageResolutionController } from '../../adapters/inbound/rest/diagnostics/page-resolution.controller.js';
import type {
  IPageResolutionOperationsFactory,
} from '../../adapters/inbound/rest/diagnostics/page-resolution-operations.factory.js';
import {
  SessionContentAccessAdapter,
} from '../../adapters/outbound/access/admin-users/content/session-content-access.adapter.js';
import { ResolutionSiteAdapter } from '../../adapters/outbound/access/diagnostics/resolution-site.adapter.js';
import {
  GetPageResolutionStatisticsUseCase,
} from '../../app/use-cases/diagnostics/get-page-resolution-statistics.use-case.js';
import { GetSiteUseCase } from '../../app/use-cases/sites/get-site.use-case.js';
import type { IGetCurrentAdminUser } from '../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type { IPageResolutionReader } from '../../ports/outbound/diagnostics/page-resolution-store.port.js';
import type { IResolutionCalendarPort } from '../../ports/outbound/diagnostics/resolution-calendar.port.js';
import type { IPageResolutionSink } from '../../ports/outbound/diagnostics/resolution-observation.port.js';
import type { ISiteRepository } from '../../ports/outbound/sites/site.repository.js';
import { GET_CURRENT_ADMIN_USER } from '../admin-auth/admin-auth.tokens.js';
import type { IPublicHttpSettings } from '../public-http.settings.js';
import { SITE_REPOSITORY } from '../sites/sites.tokens.js';
import { PAGE_RESOLUTION_OPERATIONS, PAGE_RESOLUTION_SINK, PAGE_RESOLUTION_STORE } from './diagnostics.tokens.js';
import { RESOLUTION_CALENDAR } from './diagnostics.tokens.js';

export function pageResolutionHttpProviders(settings: IPublicHttpSettings): Provider[] {
  if (!settings.adminAuth) {
    return [];
  }

  const auth = settings.adminAuth;

  return [
    {
      provide: PAGE_RESOLUTION_OPERATIONS,
      inject: [PAGE_RESOLUTION_STORE, SITE_REPOSITORY, GET_CURRENT_ADMIN_USER, RESOLUTION_CALENDAR],
      useFactory: (store: IPageResolutionReader, sites: ISiteRepository, current: IGetCurrentAdminUser,
        calendar: IResolutionCalendarPort): IPageResolutionOperationsFactory => ({
        forSession: async (token) => {
          await current.execute({ token });
          const access = new SessionContentAccessAdapter(current, token);
          const authorizedSite = new ResolutionSiteAdapter(new GetSiteUseCase(sites, access));

          return new GetPageResolutionStatisticsUseCase(store, authorizedSite, () => new Date(), calendar);
        },
      }),
    },
    {
      provide: PageResolutionController,
      inject: [PAGE_RESOLUTION_OPERATIONS, PAGE_RESOLUTION_SINK],
      useFactory: (operations: IPageResolutionOperationsFactory, sink: IPageResolutionSink) =>
        new PageResolutionController(auth, operations, sink),
    },
  ];
}
