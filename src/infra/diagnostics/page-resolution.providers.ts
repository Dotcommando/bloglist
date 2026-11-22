import { createRequire } from 'node:module';

import type { Provider } from '@nestjs/common';
import type { Connection } from 'mongoose';

import { PageResolutionObserver } from '../../adapters/inbound/documents/http/publication/page-resolution-observer.js';
import { ResolutionSiteAdapter } from '../../adapters/outbound/access/diagnostics/resolution-site.adapter.js';
import { DeferredResolutionSink } from '../../adapters/outbound/diagnostics/deferred-resolution-sink.adapter.js';
import { RenderObservationAdapter } from '../../adapters/outbound/diagnostics/render-observation.adapter.js';
import { ResolutionCalendarAdapter } from '../../adapters/outbound/diagnostics/resolution-calendar.adapter.js';
import {
  MongoosePageResolutionStore,
} from '../../adapters/outbound/persistence/mongoose/diagnostics/page-resolution-store.adapter.js';
import {
  GetPageResolutionStatisticsUseCase,
} from '../../app/use-cases/diagnostics/get-page-resolution-statistics.use-case.js';
import { RecordPageResolutionUseCase } from '../../app/use-cases/diagnostics/record-page-resolution.use-case.js';
import type { IRecordPageResolution } from '../../ports/inbound/diagnostics/record-page-resolution.port.js';
import type { IGetSite } from '../../ports/inbound/sites/get-site.port.js';
import type { IPageResolutionReader } from '../../ports/outbound/diagnostics/page-resolution-store.port.js';
import type { IPageResolutionWriter } from '../../ports/outbound/diagnostics/page-resolution-store.port.js';
import type { IResolutionCalendarPort } from '../../ports/outbound/diagnostics/resolution-calendar.port.js';
import type {
  IPageResolutionSink, IRenderObservationSessions,
} from '../../ports/outbound/diagnostics/resolution-observation.port.js';
import { MONGO_CONNECTION } from '../persistence/persistence.tokens.js';
import { GET_SITE } from '../sites/sites.tokens.js';
import {
  GET_PAGE_RESOLUTION_STATISTICS,
  PAGE_RESOLUTION_SINK,
  PAGE_RESOLUTION_STORE,
  RECORD_PAGE_RESOLUTION,
  RENDER_OBSERVATION,
} from './diagnostics.tokens.js';
import { RESOLUTION_CALENDAR } from './diagnostics.tokens.js';

export function pageResolutionProviders(): Provider[] {
  const metadata: unknown = createRequire(import.meta.url)('../../../package.json');

  if (!metadata || typeof metadata !== 'object' || !('version' in metadata) || typeof metadata.version !== 'string') {
    throw new Error('CMS package version is unavailable');
  }

  const cmsVersion = metadata.version;

  return [
    { provide: RESOLUTION_CALENDAR, useFactory: () => new ResolutionCalendarAdapter() },
    { provide: RENDER_OBSERVATION, useFactory: () => new RenderObservationAdapter() },
    {
      provide: PAGE_RESOLUTION_SINK,
      inject: [RECORD_PAGE_RESOLUTION],
      useFactory: (record: IRecordPageResolution) =>
        new DeferredResolutionSink(record),
    },
    {
      provide: PageResolutionObserver,
      inject: [RENDER_OBSERVATION,
        PAGE_RESOLUTION_SINK],
      useFactory: (observation: IRenderObservationSessions,
        sink: IPageResolutionSink) =>
        new PageResolutionObserver(observation,
          sink),
    },
    {
      provide: PAGE_RESOLUTION_STORE,
      inject: [MONGO_CONNECTION],
      useFactory: (connection: Connection) =>
        new MongoosePageResolutionStore(connection),
    },
    {
      provide: RECORD_PAGE_RESOLUTION,
      inject: [PAGE_RESOLUTION_STORE],
      useFactory: (store: IPageResolutionWriter) =>
        new RecordPageResolutionUseCase(store,
          cmsVersion),
    },
  ];
}

export function pageResolutionLocalProviders(): Provider[] {
  return [...pageResolutionProviders(), {
    provide: GET_PAGE_RESOLUTION_STATISTICS,
    inject: [PAGE_RESOLUTION_STORE, GET_SITE, RESOLUTION_CALENDAR],
    useFactory: (store: IPageResolutionReader, sites: IGetSite, calendar: IResolutionCalendarPort) =>
      new GetPageResolutionStatisticsUseCase(store, new ResolutionSiteAdapter(sites), () => new Date(), calendar),
  }];
}
