import { randomUUID } from 'node:crypto';

import { createConnection } from 'mongoose';
import { expect, it } from 'vitest';

import { MongooseAddonUpdateGate }
  from '../../src/adapters/outbound/persistence/mongoose/addons/addon-update-gate.adapter.js';
import { applyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import { AddonUpdateMode, AddonUpdatePhase } from '../../src/domain/addons/addon-update.js';

it('pauses admission before waiting on an outstanding add-on transaction', async () => {
  const mongoUri = process.env.ZARYA_TEST_MONGO_URI;

  if (!mongoUri) {
    throw new Error('Explicit isolated MongoDB required');
  }

  const connection = await createConnection(mongoUri, {
    dbName: 'zarya_test_' + randomUUID().replaceAll('-', ''),
    autoIndex: false,
    autoCreate: false,
  }).asPromise();
  let session: Awaited<ReturnType<typeof connection.startSession>> | undefined;
  let pause: Promise<unknown> | undefined;
  let observed: Promise<unknown> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    await applyMigrations(connection, 'migrations');
    const gate = new MongooseAddonUpdateGate(connection);
    const proposal = {
      updateId: randomUUID(),
      addonKey: 'synthetic',
      fromDigest: 'a'.repeat(64),
      toDigest: 'b'.repeat(64),
      fromVersion: '0.2.0',
      toVersion: '0.3.0',
      mode: AddonUpdateMode.Exclusive,
    };

    await gate.begin(proposal, 'test');
    await connection.db!.collection('site_addons').insertOne(Object.assign(Object.create(null), {
      _id: 'connection',
      siteId: 'site',
      addonKey: 'synthetic',
      status: 'Enabled',
      configuration: { schemaVersion: 1, values: {} },
      version: 'before',
      operationGuard: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'test',
      updatedBy: 'test',
    }));
    session = await connection.startSession();
    session.startTransaction();
    await connection.db!.collection('site_addons').updateOne({ siteId: 'site' },
      { $inc: { operationGuard: 1 } }, { session });
    pause = gate.change(proposal, AddonUpdatePhase.Quiescing, true);
    observed = Promise.allSettled([pause]);
    const deadline = new Promise<boolean>(resolve => {
      timer = setTimeout(() => resolve(false), 500);
    });

    expect(await Promise.race([pause.then(() => true), deadline])).toBe(true);
    expect(await gate.paused('synthetic')).toBe(true);
  } finally {
    clearTimeout(timer);
    await session?.abortTransaction();
    await observed;
    await session?.endSession();
    await connection.dropDatabase();
    await connection.close();
  }
}, 30000);
