import { randomUUID } from 'node:crypto';

import { type Connection, createConnection } from 'mongoose';

import { ResolutionCalendarAdapter } from '../../src/adapters/outbound/diagnostics/resolution-calendar.adapter.js';
import {
  MongoosePageResolutionStore,
} from '../../src/adapters/outbound/persistence/mongoose/diagnostics/page-resolution-store.adapter.js';
import { applyMigrations, verifyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import {
  GetPageResolutionStatisticsUseCase,
} from '../../src/app/use-cases/diagnostics/get-page-resolution-statistics.use-case.js';
import {
  type IPageResolutionRecord, PageDelivery, ResolutionMethod, ResolutionOutcome, ResolutionRepresentation,
} from '../../src/domain/diagnostics/page-resolution.js';

it('calculates exact request percentiles, version filters and isolation with migrated MongoDB', async () => {
  const mongoUri = process.env.ZARYA_TEST_MONGO_URI;

  if (!mongoUri) {
    throw new Error('Explicit isolated MongoDB required');
  }

  const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
  const connection: Connection = await createConnection(mongoUri, {
    dbName: database, autoCreate: false, autoIndex: false,
  }).asPromise();
  const startedAt = new Date();
  const record: IPageResolutionRecord = {
    siteId: 'site-one',
    path: '/popular/',
    cmsVersion: '0.10.1',
    startedAt,
    durationMs: 1,
    completionMs: 101,
    method: ResolutionMethod.Get,
    representation: ResolutionRepresentation.Html,
    delivery: PageDelivery.Dynamic,
    outcome: ResolutionOutcome.Success,
    statusCode: 200,
    stages: [],
    droppedStages: 0,
  };

  function assertSafeDatabase(): void {
    if (connection.name !== database || !/^zarya_test_[a-f0-9]{32}$/.test(database)) {
      throw new Error('Unsafe isolated database');
    }
  }

  try {
    await applyMigrations(connection, 'migrations');
    await verifyMigrations(connection, 'migrations');
    const store = new MongoosePageResolutionStore(connection);

    for (let index = 1; index <= 100; index++) {
      await store.append({ ...record, durationMs: index, cmsVersion: index <= 50 ? '0.10.0' : '0.10.1' });
    }

    for (let index = 1; index <= 4; index++) {
      await store.append({ ...record, path: '/static/', delivery: PageDelivery.Static, durationMs: index });
    }
    await store.append({ ...record, siteId: 'site-two', durationMs: 999 });
    await store.append({ ...record, outcome: ResolutionOutcome.NotFound, statusCode: 404 });
    await store.append({ ...record, startedAt: new Date(startedAt.getTime() - 91 * 86400000) });
    const operation = new GetPageResolutionStatisticsUseCase(store, { timeZone: async () => 'UTC' }, () => startedAt,
      new ResolutionCalendarAdapter());
    const result = await operation.execute({ siteId: 'site-one' });

    expect(result.rows).toEqual([
      { path: '/popular/', calls: 100, averageMs: 50.5, medianMs: 50.5, p95Ms: 95, p99Ms: 99 },
      { path: '/static/', calls: 4, averageMs: 2.5, medianMs: 2.5, p95Ms: 4, p99Ms: 4 },
    ]);
    expect(result.versions).toEqual(['0.10.0', '0.10.1']);
    const version = await operation.execute({ siteId: 'site-one', cmsVersion: '0.10.1' });

    expect(version.rows[0]).toEqual({
      path: '/popular/', calls: 50, averageMs: 75.5, medianMs: 75.5, p95Ms: 98, p99Ms: 100,
    });
    const indexes = await connection.collection('page_resolutions').indexes();

    expect(indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'page_resolution_retention', key: { expiresAt: 1 }, expireAfterSeconds: 0 }),
      expect.objectContaining({ key: { siteId: 1, startedAt: 1 } }),
      expect.objectContaining({ key: { siteId: 1, cmsVersion: 1, startedAt: 1 } }),
    ]));
    await expect(connection.collection('page_resolutions').insertOne({ invalid: true })).rejects.toThrow();
    const explanation = await connection.collection('page_resolutions').find({
      siteId: 'site-one', cmsVersion: '0.10.1', startedAt: { $gte: new Date(startedAt.getTime() - 86400000) },
    }).hint('page_resolution_site_version_time').explain('executionStats');

    expect(explanation.executionStats.totalKeysExamined).toBeGreaterThan(0);
    expect(explanation.executionStats.totalDocsExamined).toBeLessThan(110);
  } finally {
    assertSafeDatabase();
    await connection.dropDatabase();
    await connection.close();
  }
});
