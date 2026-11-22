import 'reflect-metadata';

import { randomUUID } from 'node:crypto';

import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type Connection, createConnection } from 'mongoose';

import { createAdminUserFromConsole } from '../../src/adapters/inbound/cli/admin-users/create-admin-user.cli.js';
import { applyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import { CREATE_ADMIN_USER_FROM_CONSOLE } from '../../src/infra/admin-users/admin-users.tokens.js';
import { AppModule } from '../../src/infra/app.module.js';
import type {
  ICreateAdminUserFromConsole,
} from '../../src/ports/inbound/admin-users/create-admin-user-from-console.port.js';

describe('administrator console with isolated MongoDB', () => {
  const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
  let connection: Connection;
  let app: INestApplicationContext;

  beforeAll(async () => {
    const mongoUri = process.env.ZARYA_TEST_MONGO_URI;

    if (!mongoUri) {
      throw new Error('Explicit isolated MongoDB endpoint required');
    }
    connection = await createConnection(mongoUri, {
      dbName: database, autoCreate: false, autoIndex: false,
    }).asPromise();
    await applyMigrations(connection, 'migrations');
    app = await NestFactory.createApplicationContext(AppModule.forAdminUserCreation({
      mongoUri,
      database,
      operator: { operatorId: 'operator', platformAdministrator: true },
    }), { logger: false, abortOnError: false });
  });

  afterAll(async () => {
    await app?.close();

    if (connection) {
      try {
        if (connection.name !== database || !/^zarya_test_[a-f0-9]{32}$/.test(database)) {
          throw new Error('Refusing to remove a non-test database');
        }
        await connection.dropDatabase();
      } finally {
        await connection.close();
      }
    }
  });

  it('creates an administrator through the real console composition and persists no plaintext password', async () => {
    const bytes = new TextEncoder().encode('admin@example.test\nSynthetic password 123!\n');
    const operation = app.get<ICreateAdminUserFromConsole>(CREATE_ADMIN_USER_FROM_CONSOLE);
    const userId = await createAdminUserFromConsole(operation, 'operator', (async function* () {
      yield bytes;
    })());
    const saved = await connection.db!.collection<{ _id: string }>('admin_users').findOne({ _id: userId });

    expect(saved).toMatchObject({ email: 'admin@example.test' });
    expect(JSON.stringify(saved)).not.toContain('Synthetic password 123!');
  });
});
