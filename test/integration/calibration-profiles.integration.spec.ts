import { randomUUID } from 'node:crypto';

import { createConnection } from 'mongoose';
import { expect, it } from 'vitest';

import { MongooseCalibrationProfiles } from
  '../../src/adapters/outbound/persistence/mongoose/calibration/calibration-profiles.adapter.js';
import { MongooseCalibrationRuns } from
  '../../src/adapters/outbound/persistence/mongoose/calibration/calibration-runs.adapter.js';
import { applyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import { CalibrationScope } from '../../src/domain/calibration/calibration-profile.js';
import { CalibrationRunStatus } from '../../src/domain/calibration/calibration-run.js';
import { BusinessErrorCode } from '../../src/domain/shared/business-error.js';
import { calibrationProfile } from '../support/calibration.js';

it('persists isolated profiles, enforces compare-and-set and retains zero traffic through soft deletion', async () => {
  const uri = process.env.ZARYA_TEST_MONGO_URI;

  if (!uri) {
    throw new Error('Explicit isolated test MongoDB URI required');
  }

  const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
  const connection = await createConnection(uri, { dbName: database, autoIndex: false, autoCreate: false }).asPromise();

  if (connection.name !== database || !/^zarya_test_[a-f0-9]{32}$/.test(database)) {
    await connection.close();
    throw new Error('Refusing non-test database');
  }

  try {
    await applyMigrations(connection, 'migrations');
    const store = new MongooseCalibrationProfiles(connection);
    const profile = calibrationProfile();

    await store.create(profile);
    expect(await store.get(profile.profileId)).toEqual(profile);
    await store.create({ ...profile, profileId: 'installation', scope: CalibrationScope.Installation, siteId: null });
    expect((await store.list({ siteId: 'other', cursor: null, limit: 10 })).items.map(p => p.profileId))
      .toEqual(['installation']);
    const results = await Promise.allSettled([
      store.replace({ ...profile, name: 'First', version: 'v2' }, 'v1'),
      store.replace({ ...profile, name: 'Second', version: 'v3' }, 'v1'),
    ]);

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const saved = await store.get('profile');

    expect(saved).not.toBeNull();
    await expect(store.remove('profile', 'v1', new Date()))
      .rejects.toMatchObject({ code: BusinessErrorCode.StaleWrite });
    await store.remove('profile', saved!.version, new Date());
    expect(await store.get('profile')).toBeNull();
    expect((await store.list({ siteId: 'one', cursor: null, limit: 10 })).items).toHaveLength(1);
    const runs = new MongooseCalibrationRuns(connection);

    for (let index = 0; index < 12; index++) {
      await runs.create({
        runId: 'run-' + index,
        profile,
        cmsVersion: '0.14.0',
        siteIds: [index ? 'one' : 'other'],
        startedAt: new Date(index * 1000),
        finishedAt: new Date(index * 1000 + 1),
        status: CalibrationRunStatus.Cancelled,
        phase: 'Finished',
        targets: [],
        generatorPlacement: 'Synthetic',
        original: { databaseCpu: 1, cmsCpu: 1, sitePoolSize: 5, sites: [{ siteId: 'one', processes: 1 }] },
        referenceId: null,
        winnerId: null,
        restored: true,
        error: 'Synthetic cancellation',
      });
    }
    const recent = await runs.latest('one', 10);

    expect(recent.map(run => run.runId)).toEqual(Array.from({ length: 10 }, (_, index) => 'run-' + (11 - index)));
    expect(recent[0]?.profile.name).toBe(profile.name);
    expect((await runs.latest('other', 10)).map(run => run.runId)).toEqual(['run-0']);
  } finally {
    await connection.dropDatabase();
    await connection.close();
  }
}, 60000);
