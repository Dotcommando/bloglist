import { createConnection, mongo } from 'mongoose';

import { HookPersistence } from '../../src/adapters/outbound/persistence/mongoose/hooks/hook.persistence.js';

describe('hook-aware transaction boundary', () => {

  it('preserves an abort runtime failure and never replays writes after that failure', async () => {
    const connection = createConnection();
    const client = new mongo.MongoClient('mongodb://localhost:27017');
    const session = client.startSession();
    const conflict = Object.assign(new Error('Synthetic write conflict'), { code: 112 });
    const aborted = new mongo.MongoRuntimeError('Synthetic abort runtime failure');

    vi.spyOn(connection, 'startSession').mockResolvedValue(session);
    vi.spyOn(session, 'startTransaction').mockImplementation(() => {});
    vi.spyOn(session, 'abortTransaction').mockRejectedValue(aborted);
    vi.spyOn(session, 'commitTransaction').mockResolvedValue(undefined);
    vi.spyOn(session, 'endSession').mockResolvedValue(undefined);
    const write = vi.fn().mockRejectedValueOnce(conflict).mockResolvedValue('must not replay');

    try {
      await expect(new HookPersistence(connection).transaction(write))
        .rejects.toMatchObject({ errors: [conflict, aborted] });
      expect(write).toHaveBeenCalledOnce();
      expect(session.commitTransaction).not.toHaveBeenCalled();
      expect(session.endSession).toHaveBeenCalledOnce();
    } finally {
      await client.close();
      await connection.close();
    }
  });

  it('repeats an aborted write conflict but never replays a transaction after entering commit', async () => {
    const connection = createConnection();
    const client = new mongo.MongoClient('mongodb://localhost:27017');
    const session = client.startSession();

    vi.spyOn(connection, 'startSession').mockResolvedValue(session);
    vi.spyOn(session, 'startTransaction').mockImplementation(() => {});
    vi.spyOn(session, 'commitTransaction').mockResolvedValue(undefined);
    vi.spyOn(session, 'abortTransaction').mockResolvedValue(undefined);
    vi.spyOn(session, 'endSession').mockResolvedValue(undefined);
    const conflict = Object.assign(new Error('Aborted write conflict'), { code: 112 });
    const write = vi.fn().mockRejectedValueOnce(conflict).mockResolvedValue('saved');
    const persistence = new HookPersistence(connection);

    try {
      await expect(persistence.transaction(write)).resolves.toBe('saved');
      expect(write).toHaveBeenCalledTimes(2);
      expect(session.abortTransaction).toHaveBeenCalledOnce();
      expect(session.commitTransaction).toHaveBeenCalledOnce();
      write.mockClear();
      vi.mocked(session.abortTransaction).mockClear();
      vi.mocked(session.commitTransaction).mockRejectedValueOnce(conflict);
      await expect(persistence.transaction(write)).rejects.toBeDefined();
      expect(write).toHaveBeenCalledOnce();
      expect(session.abortTransaction).not.toHaveBeenCalled();
      write.mockReset().mockRejectedValue(conflict);
      await expect(persistence.transaction(write)).rejects.toMatchObject({ code: 'StaleWrite' });
      expect(write).toHaveBeenCalledTimes(3);
    } finally {
      await client.close();
      await connection.close();
    }
  });
});
