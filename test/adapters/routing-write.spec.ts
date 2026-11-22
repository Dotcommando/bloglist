import { createConnection, mongo } from 'mongoose';
import { vi } from 'vitest';

import { createRoutingModels } from '../../src/adapters/outbound/persistence/mongoose/routing/routing.models.js';
import { MongooseUrlRepository } from '../../src/adapters/outbound/persistence/mongoose/routing/url.repository.js';
import { OldUrlAction } from '../../src/domain/routing/old-url-action.enum.js';
import { urlFixture } from '../support/routing.js';
import { instant } from '../support/sites.js';

describe('routing write boundaries', () => {
  afterEach(() => vi.restoreAllMocks());

  function setup(): { repository: MongooseUrlRepository;
    models: ReturnType<typeof createRoutingModels>;
    session: mongo.ClientSession;
    client: mongo.MongoClient } {
    const models = createRoutingModels(createConnection());
    const client = new mongo.MongoClient('mongodb://localhost:27017');
    const session = client.startSession();

    vi.spyOn(models.connection, 'startSession').mockResolvedValue(session);
    vi.spyOn(session, 'startTransaction').mockImplementation(() => {});
    vi.spyOn(session, 'inTransaction').mockReturnValue(true);
    vi.spyOn(session, 'commitTransaction').mockResolvedValue(undefined);
    vi.spyOn(session, 'abortTransaction').mockResolvedValue(undefined);
    vi.spyOn(session, 'endSession').mockResolvedValue(undefined);
    const guard = models.versions.updateOne({ _id: 'site-1' }, { $inc: { revision: 1 } });

    vi.spyOn(guard, 'exec').mockResolvedValue({
      acknowledged: true,
      matchedCount: 1,
      modifiedCount: 1,
      upsertedCount: 0,
      upsertedId: null,
    });
    vi.spyOn(models.versions, 'updateOne').mockReturnValue(guard);
    const query = models.urls.findOne();

    vi.spyOn(query, 'exec').mockResolvedValue(null);
    vi.spyOn(models.urls, 'findOne').mockReturnValue(query);

    return { models, session, client, repository: new MongooseUrlRepository(models, () => instant, () => 'history-1') };
  }

  it('guards site writes and acknowledges one transaction before returning', async () => {
    const { models, session, client, repository } = setup();
    const { urlId, ...state } = urlFixture().toState();

    vi.spyOn(models.urls, 'insertOne').mockResolvedValue(models.urls.hydrate({
      ...state,
      _id: urlId,
      markKey: state.mark.toLowerCase(),
    }));

    try {
      expect((await repository.save(urlFixture())).toState()).toEqual(urlFixture().toState());
      expect(models.versions.updateOne).toHaveBeenCalledOnce();
      expect(session.commitTransaction).toHaveBeenCalledOnce();
      expect(session.abortTransaction).not.toHaveBeenCalled();
      const guard = models.versions.updateOne({ _id: 'site-1' }, {});

      vi.mocked(guard.exec).mockRejectedValueOnce(Object.assign(new Error('Aborted write conflict'), { code: 112 }));
      await expect(repository.save(urlFixture())).resolves.toBeDefined();
      expect(session.abortTransaction).toHaveBeenCalledOnce();
      expect(session.commitTransaction).toHaveBeenCalledTimes(2);
    } finally {
      await session.endSession();
      await client.close();
    }
  });

  it('deletes the old leaf and its history in the same transaction as its replacement', async () => {
    const { models, session, client, repository } = setup();
    const previous = urlFixture();
    const replacement = urlFixture({ urlId: 'url-new', mark: 'New', path: '/new/' });
    const { urlId, ...state } = previous.toState();
    const lookup = models.urls.findOne();

    vi.mocked(lookup.exec).mockResolvedValueOnce(models.urls.hydrate({
      ...state,
      _id: urlId,
      markKey: state.mark.toLowerCase(),
    }));
    const references = models.urls.find();

    vi.spyOn(references, 'exec').mockResolvedValue([models.urls.hydrate({
      ...state, _id: urlId, markKey: state.mark.toLowerCase(),
    })]);
    vi.spyOn(models.urls, 'find').mockReturnValue(references);
    const deleteUrl = models.urls.deleteMany();
    const deleteHistory = models.history.deleteMany();

    vi.spyOn(deleteUrl, 'exec').mockResolvedValue({ acknowledged: true, deletedCount: 1 });
    vi.spyOn(deleteHistory, 'exec').mockResolvedValue({ acknowledged: true, deletedCount: 1 });
    const remove = vi.spyOn(models.urls, 'deleteMany').mockReturnValue(deleteUrl);
    const purge = vi.spyOn(models.history, 'deleteMany').mockReturnValue(deleteHistory);
    const redirect = vi.spyOn(models.urls, 'updateOne').mockImplementation(() => {
      throw new Error('Delete must not write a redirect');
    });
    const history = vi.spyOn(models.history, 'insertOne').mockImplementation(() => {
      throw new Error('Delete must not record retained history');
    });
    const insert = vi.spyOn(models.urls, 'insertOne').mockResolvedValue(models.urls.hydrate({
      ...replacement.toState(),
      _id: replacement.urlId,
      markKey: replacement.mark.toLowerCase(),
    }));

    try {
      await repository.changePageUrl({
        previousUrl: previous.toState(),
        newUrl: replacement,
        oldUrlAction: OldUrlAction.Delete,
        redirectStatus: 301,
        changedAt: instant,
        graphChange: { previous: [previous.toState()], next: [replacement.toState()] },
      });
      expect(remove).toHaveBeenCalledWith({ siteId: previous.siteId, _id: { $in: [urlId] } }, { session });
      expect(purge).toHaveBeenCalledWith({ siteId: previous.siteId, urlId: { $in: [urlId] } }, { session });
      expect(insert).toHaveBeenCalledOnce();
      expect(redirect).not.toHaveBeenCalled();
      expect(history).not.toHaveBeenCalled();
      expect(session.commitTransaction).toHaveBeenCalledOnce();
    } finally {
      await session.endSession();
      await client.close();
    }
  });

  it('aborts known write failure and maps a unique-index conflict without retry', async () => {
    const { models, session, client, repository } = setup();
    const failure = Object.assign(new Error('Duplicate'), { code: 11000 });
    const insert = vi.spyOn(models.urls, 'insertOne').mockRejectedValue(failure);

    try {
      await expect(repository.save(urlFixture())).rejects.toMatchObject({ name: 'RoutingConflictError' });
      expect(insert).toHaveBeenCalledOnce();
      expect(session.abortTransaction).toHaveBeenCalledOnce();
      expect(session.commitTransaction).not.toHaveBeenCalled();
    } finally {
      await session.endSession();
      await client.close();
    }
  });

  it('propagates an uncertain commit without starting a fresh transaction', async () => {
    const { models, session, client, repository } = setup();
    const { urlId, ...state } = urlFixture().toState();
    const insert = vi.spyOn(models.urls, 'insertOne').mockResolvedValue(models.urls.hydrate({
      ...state,
      _id: urlId,
      markKey: state.mark.toLowerCase(),
    }));
    const failure = Object.assign(new Error('Commit acknowledgement lost'), { code: 112 });

    vi.spyOn(session, 'commitTransaction').mockRejectedValue(failure);

    try {
      await expect(repository.save(urlFixture())).rejects.toBe(failure);
      expect(insert).toHaveBeenCalledOnce();
      expect(session.commitTransaction).toHaveBeenCalledOnce();
      expect(session.abortTransaction).not.toHaveBeenCalled();
    } finally {
      await session.endSession();
      await client.close();
    }
  });
});
