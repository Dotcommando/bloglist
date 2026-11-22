import { createConnection, mongo } from 'mongoose';
import { vi } from 'vitest';

import {
  MongooseAdminUserStore,
} from '../../src/adapters/outbound/persistence/mongoose/admin-users/admin-user-store.adapter.js';

describe('authentication persistence translation', () => {
  it('scopes active session queries and rejects cursors belonging to another account', async () => {
    const connection = createConnection();
    const store = new MongooseAdminUserStore(connection);
    const client = new mongo.MongoClient('mongodb://localhost:27017');
    const session = client.startSession();
    const lock = store.locks.updateOne({}, {});

    vi.spyOn(lock, 'exec').mockResolvedValue({
      acknowledged: true,
      matchedCount: 1,
      modifiedCount: 1,
      upsertedCount: 0,
      upsertedId: null,
    });
    vi.spyOn(store.locks, 'updateOne').mockReturnValue(lock);
    vi.spyOn(connection, 'startSession').mockResolvedValue(session);
    const query = store.sessions.find();

    vi.spyOn(query.lean(), 'exec').mockResolvedValue([]);
    const find = vi.spyOn(store.sessions, 'find').mockReturnValue(query);
    const at = new Date('2026-10-25T10:00:00Z');

    try {
      await store.runAuth(async (tx) => {
        expect(await tx.listActiveSessions('owner', 'version', at, 20, null)).toEqual({ items: [], nextCursor: null });
        const cursor = Buffer.from(JSON.stringify({
          adminUserId: 'foreign',
          accountVersion: 'version',
          createdAt: at.toISOString(),
          sessionId: 'session',
        })).toString('base64url');

        await expect(tx.listActiveSessions('owner', 'version', at, 20, cursor))
          .rejects.toMatchObject({ code: 'Validation' });
      });
      expect(find).toHaveBeenCalledOnce();
      expect(find.mock.calls[0]?.[0]).toEqual({
        adminUserId: 'owner',
        accountVersion: 'version',
        revokedAt: null,
        expiresAt: { $gt: at },
      });
      expect(query.getOptions()).toMatchObject({ limit: 21, sort: { createdAt: 1, _id: 1 } });
    } finally {
      await client.close();
    }
  });
});
