import { createConnection, mongo } from 'mongoose';

import { publicationModels } from '../../src/adapters/outbound/persistence/mongoose/publication/publication.models.js';
import {
  MongooseReleaseActivationAdapter,
} from '../../src/adapters/outbound/persistence/mongoose/publication/release-activation.adapter.js';
import { ReleaseState } from '../../src/domain/publication/publication-release.js';

describe('atomic release activation boundary', () => {
  it.each([false, true])('retries a write conflict only after confirmed abort: unknown=%s', async (unknownAbort) => {
    const connection = createConnection();
    const models = publicationModels(connection);
    const client = new mongo.MongoClient('mongodb://localhost:27017');
    const session = client.startSession();
    const at = new Date();

    vi.spyOn(connection, 'startSession').mockResolvedValue(session);
    vi.spyOn(session, 'startTransaction').mockImplementation(() => {});
    const abort = vi.spyOn(session, 'abortTransaction').mockResolvedValue(undefined);

    if (unknownAbort) {
      abort.mockRejectedValueOnce(new Error('Abort could not be confirmed'));
    }
    vi.spyOn(session, 'commitTransaction').mockResolvedValue(undefined);
    vi.spyOn(session, 'endSession').mockResolvedValue(undefined);
    const query = models.active.findOne();

    vi.spyOn(models.active, 'findOne').mockReturnValue(query);
    vi.spyOn(query, 'exec').mockRejectedValueOnce(Object.assign(new Error('Write conflict'), { code: 112 }))
      .mockResolvedValue(new models.active({ _id: 'site', siteId: 'site', releaseId: 'old', activatedAt: at }));
    const update = models.active.updateOne({}, {});

    vi.spyOn(models.active, 'updateOne').mockReturnValue(update);
    vi.spyOn(update, 'exec').mockResolvedValue({
      acknowledged: true,
      matchedCount: 1,
      modifiedCount: 1,
      upsertedCount: 0,
      upsertedId: null,
    });
    vi.spyOn(models.activations, 'insertOne').mockResolvedValue(new models.activations({
      _id: 'new', siteId: 'site', activatedAt: at,
    }));
    const adapter = new MongooseReleaseActivationAdapter(models, {
      stage: vi.fn(),
      read: async () => ({
        releaseId: 'new',
        siteId: 'site',
        state: ReleaseState.Ready,
        manifest: { routes: [], artifacts: [] },
        failure: null,
        createdAt: at,
        completedAt: at,
      }),
    });

    try {
      const result = adapter.activate({
        siteId: 'site',
        releaseId: 'new',
        expectedActiveReleaseId: 'old',
        activatedAt: at,
      });

      if (unknownAbort) {
        await expect(result).rejects.toMatchObject({ code: 'StaleWrite' });
        expect(query.exec).toHaveBeenCalledOnce();
        expect(session.commitTransaction).not.toHaveBeenCalled();
      } else {
        await expect(result).resolves.toMatchObject({ releaseId: 'new' });
        expect(query.exec).toHaveBeenCalledTimes(2);
        expect(session.commitTransaction).toHaveBeenCalledOnce();
      }
      expect(session.abortTransaction).toHaveBeenCalledOnce();
      expect(session.endSession).toHaveBeenCalledOnce();
    } finally {
      await client.close();
      await connection.close();
    }
  });
  it('rejects stale expected pointers before changing active state', async () => {
    const connection = createConnection();
    const models = publicationModels(connection);
    const client = new mongo.MongoClient('mongodb://localhost:27017');
    const session = client.startSession();

    vi.spyOn(connection, 'startSession').mockResolvedValue(session);
    vi.spyOn(session, 'abortTransaction').mockResolvedValue(undefined);
    vi.spyOn(session, 'endSession').mockResolvedValue(undefined);
    const query = models.active.findOne();

    vi.spyOn(query, 'exec').mockResolvedValue(new models.active({
      _id: 'site',
      siteId: 'site',
      releaseId:
'newer',
      activatedAt: new Date(),
    }));
    vi.spyOn(models.active, 'findOne').mockReturnValue(query);
    const update = vi.spyOn(models.active, 'updateOne');
    const at = new Date();
    const adapter = new MongooseReleaseActivationAdapter(models, {
      stage: async () => {},
      read: async () => ({
        siteId: 'site',
        releaseId: 'release',
        state: ReleaseState.Ready,
        manifest: { routes: [], artifacts: [] },
        failure: null,
        createdAt: at,
        completedAt: at,
      }),
    });

    try {
      await expect(adapter.activate({
        siteId: 'site',
        releaseId: 'release',
        expectedActiveReleaseId: null,
        activatedAt: at,
      }))
        .rejects.toMatchObject({ code: 'StaleWrite' });
      expect(update).not.toHaveBeenCalled();
      expect(session.abortTransaction).toHaveBeenCalledOnce();
    } finally {
      await client.close();
      await connection.close();
    }
  });
});
