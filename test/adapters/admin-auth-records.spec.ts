import { type ClientSession, createConnection, mongo } from 'mongoose';

import {
  adminAuthRecords, createAdminAuthModels, type IAdminAuthModels,
} from '../../src/adapters/outbound/persistence/mongoose/admin-auth/admin-auth.records.js';
import { AdminAuthSession, type IAdminAuthSessionState } from '../../src/domain/admin-auth/admin-auth-session.js';

interface IAuthRecordsFixture {
  readonly models: IAdminAuthModels;
  readonly session: ClientSession;
  readonly records: ReturnType<typeof adminAuthRecords>;
  close(): Promise<void>;
}

function sessionState(sessionId: string): IAdminAuthSessionState {
  return {
    sessionId,
    adminUserId: 'owner',
    accountVersion: 'version',
    tokenDigest: 'a'.repeat(64),
    createdAt: new Date('2026-11-01T00:00:00Z'),
    lastSeenAt: new Date('2026-11-01T00:00:00Z'),
    expiresAt: new Date('2027-01-01T00:00:00Z'),
    revokedAt: null,
    clientAddress: null,
    userAgent: null,
  };
}

function fixture(): IAuthRecordsFixture {
  const connection = createConnection();
  const models = createAdminAuthModels(connection);
  const client = new mongo.MongoClient('mongodb://localhost');
  const session = client.startSession();

  return {
    models,
    session,
    records: adminAuthRecords(models, session),
    close: async () => {
      await session.endSession();
      await connection.close();
      await client.close();
    },
  };
}

describe('authentication record adapter methods', () => {
  it('paginates tied timestamps and rejects foreign owner/version cursors before querying', async () => {
    const f = fixture();
    const query = f.models.sessions.find();
    const rows = ['a', 'b', 'c'].map((id) => {
      const { sessionId, ...fields } = sessionState(id);

      return { _id: sessionId, ...fields };
    });

    vi.spyOn(query.lean<typeof rows>(), 'exec').mockResolvedValueOnce(rows).mockResolvedValueOnce([rows[2]!]);
    const find = vi.spyOn(f.models.sessions, 'find').mockReturnValue(query);
    const at = new Date('2026-11-02T00:00:00Z');

    try {
      const first = await f.records.listActiveSessions('owner', 'version', at, 2, null);

      expect(first.items.map((item) => item.toState().sessionId)).toEqual(['a', 'b']);
      expect(first.nextCursor).not.toBeNull();
      const next = await f.records.listActiveSessions('owner', 'version', at, 2, first.nextCursor);

      expect(next.items.map((item) => item.toState().sessionId)).toEqual(['c']);
      expect(next.nextCursor).toBeNull();
      expect(find.mock.calls[1]?.[0]).toEqual({
        adminUserId: 'owner',
        accountVersion: 'version',
        revokedAt: null,
        expiresAt: { $gt: at },
        $or: [{ createdAt: { $gt: rows[1]!.createdAt } }, { createdAt: rows[1]!.createdAt, _id: { $gt: 'b' } }],
      });
      await expect(f.records.listActiveSessions('foreign', 'version', at, 2, first.nextCursor))
        .rejects.toMatchObject({ code: 'Validation' });
      await expect(f.records.listActiveSessions('owner', 'new-version', at, 2, first.nextCursor))
        .rejects.toMatchObject({ code: 'Validation' });
      expect(find).toHaveBeenCalledTimes(2);
    } finally {
      await f.close();
    }
  });

  it('guards session writes by identity, owner, account version and digest and rejects a lost match', async () => {
    const f = fixture();
    const query = f.models.sessions.updateOne({}, {});

    vi.spyOn(query, 'exec').mockResolvedValueOnce({
      acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0, upsertedId: null,
    });
    const update = vi.spyOn(f.models.sessions, 'updateOne').mockReturnValue(query);
    const state = sessionState('owned');

    try {
      await expect(f.records.saveSession(new AdminAuthSession(state))).rejects.toMatchObject({ code: 'StaleWrite' });
      expect(update.mock.calls[0]?.[0]).toEqual({
        _id: 'owned', adminUserId: 'owner', accountVersion: 'version', tokenDigest: state.tokenDigest,
      });
      expect(update.mock.calls[0]?.[2]).toEqual({ session: f.session });
      expect(update.mock.calls[0]?.[1]).toHaveProperty('$set.revokedAt', null);
    } finally {
      await f.close();
    }
  });

  it('maps session identity and propagates read failure instead of reporting absence', async () => {
    const f = fixture();
    const query = f.models.sessions.findOne();
    const { sessionId, ...fields } = sessionState('owned');
    const failure = new Error('Session read failed');
    const row = { _id: sessionId, ...fields };

    vi.spyOn(query.lean<typeof row | null>(), 'exec').mockResolvedValueOnce(row).mockRejectedValueOnce(failure);
    const find = vi.spyOn(f.models.sessions, 'findOne').mockReturnValue(query);

    try {
      expect((await f.records.findSessionById('owned'))!.toState()).toEqual(sessionState('owned'));
      expect(find.mock.calls[0]?.[0]).toEqual({ _id: 'owned' });
      await expect(f.records.findSessionByDigest(fields.tokenDigest)).rejects.toBe(failure);
      expect(find.mock.calls[1]?.[0]).toEqual({ tokenDigest: fields.tokenDigest });
    } finally {
      await f.close();
    }
  });
});
