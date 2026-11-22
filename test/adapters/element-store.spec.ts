import { createConnection, mongo } from 'mongoose';

import { HookPersistence } from '../../src/adapters/outbound/persistence/mongoose/hooks/hook.persistence.js';
import { MongooseHookConfiguration }
  from '../../src/adapters/outbound/persistence/mongoose/hooks/hook-configuration.adapter.js';
import { MongooseHookEvents } from '../../src/adapters/outbound/persistence/mongoose/hooks/hook-events.adapter.js';
import {
  elementSchema, type IElementRecord,
} from '../../src/adapters/outbound/persistence/mongoose/rendering/element.schema.js';
import {
  MongooseElementStore,
} from '../../src/adapters/outbound/persistence/mongoose/rendering/element-store.adapter.js';
import { ElementBackupState } from '../../src/domain/rendering/rendering-element.js';
import { elementFixture } from '../support/rendering.js';

describe('rendering entity persistence boundary', () => {
  it('completes an independent creation after repeated aborted database write conflicts', async () => {
    const connection = createConnection();
    const client = new mongo.MongoClient('mongodb://localhost:27017');
    const session = client.startSession();
    const model = connection.model<IElementRecord>('ContendedElementUnit', elementSchema);
    const persistence = new HookPersistence(connection);
    const events = new MongooseHookEvents(persistence, new MongooseHookConfiguration(persistence), async () => []);
    const adapter = new MongooseElementStore(model, events);
    const element = elementFixture();
    const conflict = Object.assign(new Error('Synthetic write conflict'), { code: 112 });
    const create = vi.spyOn(model, 'insertOne')
      .mockRejectedValueOnce(conflict).mockRejectedValueOnce(conflict).mockRejectedValueOnce(conflict)
      .mockResolvedValue(new model());
    const record = vi.spyOn(events, 'record').mockResolvedValue(undefined);

    vi.spyOn(connection, 'startSession').mockResolvedValue(session);
    vi.spyOn(session, 'startTransaction').mockImplementation(() => {});
    vi.spyOn(session, 'abortTransaction').mockResolvedValue(undefined);
    vi.spyOn(session, 'commitTransaction').mockResolvedValue(undefined);
    vi.spyOn(session, 'endSession').mockResolvedValue(undefined);
    vi.useFakeTimers();

    try {
      const result = Promise.allSettled([adapter.save(element, null, {
        installationId: 'local',
        scopeKey: element.siteId,
        siteId: element.siteId,
        generation: '1',
        registryVersion: 'version',
        recipients: [],
        operationId: 'create',
        actorId: 'owner',
        subject: element.elementId,
        facts: [{ hookKey: 'cms.element.created', payload: {} }],
        occurredAt: element.createdAt,
        chainId: 'create',
        causalDepth: 0,
      })]);

      await vi.runAllTimersAsync();
      expect(await result).toEqual([{ status: 'fulfilled', value: undefined }]);
      expect(create).toHaveBeenCalledTimes(4);
      expect(session.abortTransaction).toHaveBeenCalledTimes(3);
      expect(record).toHaveBeenCalledOnce();
      expect(session.commitTransaction).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
      await client.close();
      await connection.close();
    }
  });

  it('retries backup acquisition conflicts and never replays a started file write', async () => {
    const connection = createConnection();
    const client = new mongo.MongoClient('mongodb://localhost:27017');
    const session = client.startSession();
    const model = connection.model<IElementRecord>('ContendedBackupUnit', elementSchema);
    const adapter = new MongooseElementStore(model);
    const element = elementFixture({ backupState: ElementBackupState.Pending });
    const { elementId, ...state } = element;
    const conflict = Object.assign(new Error('Synthetic write conflict'), { code: 112 });
    const lock = model.findOneAndUpdate();
    const lockQuery = lock.lean();
    const update = model.updateOne({}, {});
    const write = vi.fn().mockResolvedValue(undefined);

    vi.spyOn(connection, 'startSession').mockResolvedValue(session);
    vi.spyOn(session, 'startTransaction').mockImplementation(() => {});
    vi.spyOn(session, 'inTransaction').mockReturnValue(true);
    vi.spyOn(session, 'abortTransaction').mockResolvedValue(undefined);
    vi.spyOn(session, 'commitTransaction').mockResolvedValue(undefined);
    vi.spyOn(session, 'endSession').mockResolvedValue(undefined);
    vi.spyOn(model, 'findOneAndUpdate').mockReturnValue(lock);
    vi.spyOn(lockQuery, 'exec').mockRejectedValueOnce(conflict).mockResolvedValue({ _id: elementId, __v: 0, ...state });
    vi.spyOn(model, 'updateOne').mockReturnValue(update);
    vi.spyOn(update, 'exec').mockResolvedValue({
      acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0, upsertedId: null,
    });
    vi.useFakeTimers();

    try {
      const result = Promise.allSettled([adapter.synchronizeBackup(element, element.version, write)]);

      await vi.runAllTimersAsync();
      expect(await result).toEqual([{
        status: 'fulfilled', value: { ...element, backupState: ElementBackupState.Ready },
      }]);
      expect(write).toHaveBeenCalledOnce();
      expect(session.abortTransaction).toHaveBeenCalledOnce();
      expect(session.commitTransaction).toHaveBeenCalledOnce();

      write.mockRejectedValueOnce(conflict);
      const failedWrite = Promise.allSettled([adapter.synchronizeBackup(element, element.version, write)]);

      await vi.runAllTimersAsync();
      expect(await failedWrite).toMatchObject([{ status: 'rejected', reason: { code: 'StaleWrite' } }]);
      expect(write).toHaveBeenCalledTimes(2);
      expect(session.commitTransaction).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
      await client.close();
      await connection.close();
    }
  });

  it('uses site, kind and key for reads and translates only duplicate writes into conflicts', async () => {
    const model = createConnection().model<IElementRecord>('ElementUnit', elementSchema);
    const query = model.findOne();

    vi.spyOn(query, 'exec').mockResolvedValue(null);
    vi.spyOn(model, 'findOne').mockReturnValue(query);
    const create = vi.spyOn(model, 'insertOne')
      .mockRejectedValue(Object.assign(new Error('Duplicate'), { code: 11000 }));
    const adapter = new MongooseElementStore(model);

    expect(await adapter.find(elementFixture())).toBeNull();
    expect(model.findOne).toHaveBeenCalledWith({ siteId: 'site-1', kind: 'Template', key: 'Home' });
    await expect(adapter.save(elementFixture(), null)).rejects.toMatchObject({ code: 'Conflict' });
    create.mockRejectedValue(new Error('Unavailable'));
    await expect(adapter.save(elementFixture(), null)).rejects.toThrow('Unavailable');
  });
});
