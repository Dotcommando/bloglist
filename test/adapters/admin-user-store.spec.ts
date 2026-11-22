import { createConnection, mongo } from 'mongoose';
import { vi } from 'vitest';

import {
  MongooseAdminUserStore,
} from '../../src/adapters/outbound/persistence/mongoose/admin-users/admin-user-store.adapter.js';
import * as roles from '../../src/adapters/outbound/persistence/mongoose/authorization/admin-authority.adapter.js';
import { AdminUserListStatus } from '../../src/domain/admin-users/admin-user-profile.js';
import { account } from '../support/admin-users.js';

describe('admin persistence translation', () => {
  it('aborts if its serialization record cannot be acquired', async () => {
    const connection = createConnection();
    const store = new MongooseAdminUserStore(connection);
    const client = new mongo.MongoClient('mongodb://localhost:27017');
    const session = client.startSession();
    const query = store.locks.updateOne({}, {});
    const result = { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0, upsertedId: null };

    vi.spyOn(query, 'exec').mockResolvedValueOnce(result).mockResolvedValueOnce({ ...result, matchedCount: 0 });
    vi.spyOn(store.locks, 'updateOne').mockReturnValue(query);
    vi.spyOn(connection, 'startSession').mockResolvedValue(session);
    const work = vi.fn(async () => 'must not run');

    try {
      await expect(store.run(work)).rejects.toMatchObject({ code: 'Conflict' });
      expect(work).not.toHaveBeenCalled();
    } finally {
      await client.close();
    }
  });
  it('selects only safe profile fields and hides deleted records', async () => {
    const store = new MongooseAdminUserStore(createConnection());
    const { adminUserId, ...state } = account().toState();
    const query = store.users.findOne();
    const leanQuery = query.select({ email: 1 }).lean();

    vi.spyOn(leanQuery, 'exec').mockResolvedValueOnce({ _id: adminUserId, ...state, __v: 0 });
    const find = vi.spyOn(store.users, 'findOne').mockReturnValueOnce(query);
    const authority = vi.spyOn(roles, 'readAdminAuthority')
      .mockResolvedValueOnce({ systemAdmin: true, siteIds: [], siteAdminSiteIds: [] });
    const result = await store.findById(adminUserId);

    authority.mockRestore();

    expect(find.mock.calls[0]?.[0]).toEqual({ _id: adminUserId, deletedAt: null });
    expect(result).toMatchObject({ adminUserId, email: state.email });
    expect(result).not.toHaveProperty('passwordDigest');
  });
  it('rejects malformed or foreign-filter cursors without sending them to MongoDB', async () => {
    const store = new MongooseAdminUserStore(createConnection());
    const find = vi.spyOn(store.users, 'find');

    await expect(store.list({ status: AdminUserListStatus.All, limit: 20, cursor: 'invalid' }))
      .rejects.toMatchObject({ code: 'Validation' });
    expect(find).not.toHaveBeenCalled();
  });
  it('propagates transaction startup failure instead of executing unguarded writes', async () => {
    const connection = createConnection();
    const store = new MongooseAdminUserStore(connection);
    const query = store.locks.updateOne({}, {});

    vi.spyOn(query, 'exec').mockResolvedValueOnce({
      acknowledged: true,
      matchedCount: 1,
      modifiedCount: 0,
      upsertedCount: 0,
      upsertedId: null,
    });
    vi.spyOn(store.locks, 'updateOne').mockReturnValueOnce(query);
    vi.spyOn(connection, 'startSession').mockRejectedValueOnce(new Error('No transaction'));
    const work = vi.fn(async () => 'must not run');

    await expect(store.run(work)).rejects.toThrow('No transaction');
    expect(work).not.toHaveBeenCalled();
  });
});
