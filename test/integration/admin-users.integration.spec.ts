import 'reflect-metadata';

import { randomUUID } from 'node:crypto';

import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type Connection, createConnection } from 'mongoose';

import { applyMigrations, verifyMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import type { IAdminUserState } from '../../src/domain/admin-users/admin-user.js';
import { AdminUserListStatus } from '../../src/domain/admin-users/admin-user-profile.js';
import {
  ADMIN_USER_UNIT_OF_WORK, BLOCK_ADMIN_USER, CREATE_ADMIN_USER_FROM_CONSOLE,
  DELETE_ADMIN_USER, GET_ADMIN_USER, LIST_ADMIN_USERS,
  UPDATE_ADMIN_USER,
} from '../../src/infra/admin-users/admin-users.tokens.js';
import { AppModule } from '../../src/infra/app.module.js';
import type { IBlockAdminUser } from '../../src/ports/inbound/admin-users/block-admin-user.port.js';
import type { IDeleteAdminUser } from '../../src/ports/inbound/admin-users/delete-admin-user.port.js';
import type { IGetAdminUser } from '../../src/ports/inbound/admin-users/get-admin-user.port.js';
import type { IListAdminUsers } from '../../src/ports/inbound/admin-users/list-admin-users.port.js';
import type { IUpdateAdminUser } from '../../src/ports/inbound/admin-users/update-admin-user.port.js';
import type { IAdminUserUnitOfWorkPort } from '../../src/ports/outbound/admin-users/admin-user-store.port.js';
import { account } from '../support/admin-users.js';

interface IStoredAdminUser extends Omit<IAdminUserState, 'adminUserId'> { readonly _id: string; }

describe('administrator operations with real composition and isolated MongoDB', () => {
  const database = 'zarya_test_' + randomUUID().replaceAll('-', '');
  let connection: Connection;
  let app: INestApplicationContext;
  let unitOfWork: IAdminUserUnitOfWorkPort;
  let get: IGetAdminUser;
  let update: IUpdateAdminUser;
  let block: IBlockAdminUser;
  let remove: IDeleteAdminUser;
  let list: IListAdminUsers;
  const input = { actorId: 'operator', adminUserId: 'user-1', expectedVersion: 'user-1-v1' };

  beforeAll(async () => {
    const mongoUri = process.env.ZARYA_TEST_MONGO_URI;

    if (!mongoUri) {
      throw new Error('Explicit isolated MongoDB endpoint required');
    }
    connection = await createConnection(mongoUri, {
      dbName: database, autoCreate: false, autoIndex: false,
    }).asPromise();
    await applyMigrations(connection, 'migrations');
    app = await NestFactory.createApplicationContext(AppModule.forLocalOperator({
      mongoUri,
      database,
      operator: { operatorId: 'operator', platformAdministrator: true },
    }), { logger: false, abortOnError: false });
    unitOfWork = app.get<IAdminUserUnitOfWorkPort>(ADMIN_USER_UNIT_OF_WORK);
    get = app.get<IGetAdminUser>(GET_ADMIN_USER);
    update = app.get<IUpdateAdminUser>(UPDATE_ADMIN_USER);
    block = app.get<IBlockAdminUser>(BLOCK_ADMIN_USER);
    remove = app.get<IDeleteAdminUser>(DELETE_ADMIN_USER);
    list = app.get<IListAdminUsers>(LIST_ADMIN_USERS);
  });
  beforeEach(async () => {
    if (connection.name !== database || !/^zarya_test_[a-f0-9]{32}$/.test(database)) {
      throw new Error('Refusing to reset an unrelated database');
    }
    await connection.collection('admin_users').deleteMany({});
    await connection.collection('role_assignments').deleteMany({});
    await unitOfWork.run(async (users) => {
      await users.save(account('user-1'), null);
      await users.save(account('user-2'), null);
    });
  });
  afterAll(async () => {
    await app?.close();

    if (connection) {
      try {
        if (connection.name !== database || !/^zarya_test_[a-f0-9]{32}$/.test(database)) {
          throw new Error('Refusing to remove an unrelated database');
        }
        await connection.dropDatabase();
      } finally {
        await connection.close();
      }
    }
  });
  it('reads safe global profiles and updates credentials without exposing their digest', async () => {
    expect(() => app.get(CREATE_ADMIN_USER_FROM_CONSOLE)).toThrow();
    expect(await get.execute(input)).toMatchObject({ email: 'user-1@example.test', allowedSiteIds: [] });
    expect(await get.execute(input)).not.toHaveProperty('passwordDigest');
    const updated = await update.execute({
      ...input,
      email: ' NEW@EXAMPLE.TEST ',
      password: 'synthetic changed password',
      allowedSiteIds: [],
    });

    expect(updated.email).toBe('new@example.test');
    expect(updated).not.toHaveProperty('passwordDigest');
    const stored = await connection.collection('admin_users').findOne({ email: 'new@example.test' });

    expect(stored?.passwordDigest).toMatch(/^scrypt\$v1\$/);
    expect(stored?.passwordDigest).not.toContain('synthetic changed password');
    await expect(get.execute({ ...input, actorId: 'foreign' })).rejects.toMatchObject({ code: 'Forbidden' });
    await expect(update.execute({ ...input, allowedSiteIds: ['site'] })).rejects.toMatchObject({ code: 'Validation' });
  });
  it('enforces uniqueness without case at the database boundary', async () => {
    await expect(update.execute({ ...input, email: 'USER-2@EXAMPLE.TEST' }))
      .rejects.toMatchObject({ code: 'Conflict' });
    const { adminUserId, ...state } = account('third').toState();

    await expect(connection.collection<IStoredAdminUser>('admin_users')
      .insertOne({ ...state, _id: adminUserId, email: 'USER-1@EXAMPLE.TEST' }))
      .rejects.toMatchObject({ code: 11000 });
    await expect(connection.collection<IStoredAdminUser>('admin_users')
      .insertOne({ ...state, _id: 'invalid', allowedSiteIds: ['site'] }))
      .rejects.toMatchObject({ code: 121 });
    await verifyMigrations(connection, 'migrations');
  });
  it('preserves optimistic concurrency during simultaneous profile updates', async () => {
    const results = await Promise.allSettled(['first@example.test', 'second@example.test'].map((email) =>
      update.execute({ ...input, email })));

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: { code: 'StaleWrite' } });
  });
  it('handles simultaneous initialization of its serialization record', async () => {
    await connection.collection<{ _id: string }>('admin_user_locks').deleteOne({ _id: 'global' });
    const results = await Promise.allSettled([1, 2].map((n) => block.execute({
      actorId: 'operator', adminUserId: 'user-' + n, expectedVersion: 'user-' + n + '-v1', blocked: true,
    })));

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: { code: 'LastAdministrator' } });
  });
  it.each(['block', 'delete', 'mixed'])('protects the last administrator during concurrent %s edits', async (mode) => {
    const results = await Promise.allSettled([1, 2].map((n) => {
      const target = { actorId: 'operator', adminUserId: 'user-' + n, expectedVersion: 'user-' + n + '-v1' };

      return mode === 'delete' || mode === 'mixed' && n === 2 ? remove.execute(target)
        : block.execute({ ...target, blocked: true });
    }));

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: { code: 'LastAdministrator' } });
    expect(await connection.collection('admin_users').countDocuments({ blocked: false, deletedAt: null })).toBe(1);
  });
  it('unblocks an account and keeps already matching block state unchanged', async () => {
    const blocked = await block.execute({ ...input, blocked: true });

    expect((await block.execute({ ...input, expectedVersion: blocked.version, blocked: true })).version)
      .toBe(blocked.version);
    const unblocked = await block.execute({ ...input, expectedVersion: blocked.version, blocked: false });

    expect(unblocked.blocked).toBe(false);
  });
  it('soft-deletes, hides the record and releases its email for a new identity', async () => {
    await remove.execute(input);
    expect(await get.execute(input)).toBeNull();
    expect((await list.execute({ actorId: 'operator' })).items.map((u) => u.adminUserId)).toEqual(['user-2']);
    const replacement = account('replacement');

    replacement.update({ email: 'user-1@example.test' }, new Date(), 'replacement-v2');
    await unitOfWork.run(async (users) => {
      await users.save(replacement, null);
    });
    expect((await get.execute({ ...input, adminUserId: 'replacement' }))?.email).toBe('user-1@example.test');
    expect(await connection.collection('admin_users').countDocuments()).toBe(3);
    await expect(remove.execute(input)).rejects.toMatchObject({ code: 'NotFound' });
  });
  it('paginates tied creation dates, includes blocked accounts and binds cursors to their filter', async () => {
    await block.execute({ ...input, blocked: true });
    const first = await list.execute({ actorId: 'operator', limit: 1 });

    expect(first.items.map((u) => u.adminUserId)).toEqual(['user-1']);
    const second = await list.execute({ actorId: 'operator', limit: 1, cursor: first.nextCursor });

    expect(second.items.map((u) => u.adminUserId)).toEqual(['user-2']);
    expect(second.nextCursor).toBeNull();
    await expect(list.execute({ actorId: 'operator', status: AdminUserListStatus.Active, cursor: first.nextCursor }))
      .rejects.toMatchObject({ code: 'Validation' });
    expect((await list.execute({ actorId: 'operator', status: AdminUserListStatus.Active })).items)
      .toHaveLength(1);
  });
  it('rolls back account mutations when an operation fails before commit', async () => {
    await expect(unitOfWork.run(async (users) => {
      const user = await users.findById('user-1');

      if (!user) {
        throw new Error('Missing fixture');
      }
      user.update({ email: 'not-committed@example.test' }, new Date(), 'not-committed-v');
      await users.save(user, 'user-1-v1');
      throw new Error('Injected failure');
    })).rejects.toThrow('Injected failure');
    expect((await get.execute(input))?.email).toBe('user-1@example.test');
  });
});
