import { randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { type Connection, createConnection } from 'mongoose';

import {
  MongooseDeploymentStore,
} from '../../src/adapters/outbound/persistence/mongoose/deployment/deployment-store.adapter.js';
import { applyMigrations, verifyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import {
  DeploymentIssue, DeploymentReason, DeploymentRecovery, DeploymentStage, DeploymentState,
} from '../../src/domain/deployment/deployment.js';
import { deploymentFixture } from '../helpers/deployment.fixture.js';

describe('deployment persistence through real MongoDB and versioned migrations', () => {
  const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
  let connection: Connection;

  beforeAll(async () => {
    if (!process.env.ZARYA_TEST_MONGO_URI) {
      throw new Error('Explicit isolated MongoDB URI required');
    }
    connection = await createConnection(process.env.ZARYA_TEST_MONGO_URI, {
      dbName: database, autoCreate: false, autoIndex: false,
    }).asPromise();
    await applyMigrations(connection, 'migrations');
    await verifyMigrations(connection, 'migrations');
  });
  afterAll(async () => {
    if (connection?.name === database && /^zarya_test_[a-f0-9]{32}$/.test(database)) {
      await connection.dropDatabase();
      await connection.close();
    }
  });

  it.each([
    ['0.9.1', ['0000-schema-migrations.json', '0001-deployment-targets.json']],
    ['0.9.2', ['0000-schema-migrations.json', '0001-deployment-targets.json', '0002-deployment-diagnostics.json']],
  ])('upgrades %s records while preserving migration receipts and delivery history', async (_version, files) => {
    const name = 'zarya_test_' + randomUUID().replaceAll('-', '');
    const previous = await mkdtemp(path.join(os.tmpdir(), 'zarya-upgrade-'));
    const upgrade = await createConnection(process.env.ZARYA_TEST_MONGO_URI!, {
      dbName: name, autoCreate: false, autoIndex: false,
    }).asPromise();

    try {
      for (const file of files) {
        await copyFile(path.join('migrations', file), path.join(previous, file));
      }
      await applyMigrations(upgrade, previous);
      const store = new MongooseDeploymentStore(upgrade);
      const existing = deploymentFixture();

      await store.save(existing, null);
      const receipts = await upgrade.collection('schema_migrations').find({}).toArray();

      await applyMigrations(upgrade, 'migrations');
      await verifyMigrations(upgrade, 'migrations');
      expect(await store.get(existing.siteId)).toEqual(existing);

      for (const receipt of receipts) {
        expect(await upgrade.collection('schema_migrations').findOne({ _id: receipt._id })).toEqual(receipt);
      }
      await store.save({
        ...existing,
        version: 'diagnostic-v2',
        state: DeploymentState.OutcomeUnknown,
        diagnostic: {
          issue: DeploymentIssue.Backend,
          retryable: false,
          stage: DeploymentStage.PublicVerification,
          reason: DeploymentReason.HttpStatus,
          httpStatus: 400,
          recovery: DeploymentRecovery.CheckBackendAndReconcile,
        },
      }, existing.version);
      expect((await new MongooseDeploymentStore(upgrade).get(existing.siteId))?.diagnostic)
        .toMatchObject({ stage: 'PublicVerification', httpStatus: 400 });
      await expect(upgrade.collection('deployment_targets').updateOne(
        { siteId: existing.siteId }, { $set: { 'diagnostic.httpStatus': 999 } })).rejects.toMatchObject({ code: 121 });
    } finally {
      if (upgrade.name === name && /^zarya_test_[a-f0-9]{32}$/.test(name)) {
        await upgrade.dropDatabase();
      }
      await upgrade.close();

      if (path.dirname(previous) === os.tmpdir() && path.basename(previous).startsWith('zarya-upgrade-')) {
        await rm(previous, { recursive: true, force: true });
      }
    }
  });

  it('allows one owner, persists recovery state and prevents site/destination collisions', async () => {
    const store = new MongooseDeploymentStore(connection);
    const fixture = deploymentFixture();

    await store.save(fixture, null);
    await expect(store.get('foreign-site')).resolves.toBeNull();
    const attempts = await Promise.allSettled(['owner-a', 'owner-b'].map((version) => store.save({
      ...fixture, version, state: DeploymentState.OutcomeUnknown,
    }, fixture.version)));

    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((result) => result.status === 'rejected')).toHaveLength(1);
    await expect(new MongooseDeploymentStore(connection).get(fixture.siteId))
      .resolves.toMatchObject({ state: DeploymentState.OutcomeUnknown });
    await expect(store.save({ ...fixture, target: { ...fixture.target, targetId: 'second-target' } }, null))
      .rejects.toMatchObject({ code: 'StaleWrite' });
    const foreign = deploymentFixture('site-b');

    await expect(store.save(foreign, null)).rejects.toMatchObject({ code: 'StaleWrite' });
    await expect(connection.collection('deployment_targets').insertOne({ invalid: true }))
      .rejects.toMatchObject({ code: 121 });
  });
});
