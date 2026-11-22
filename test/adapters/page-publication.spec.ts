import { createConnection, mongo } from 'mongoose';

import { type IPageRecord, pageSchema } from '../../src/adapters/outbound/persistence/mongoose/pages/page.schema.js';
import {
  MongoosePagePublicationAdapter,
} from '../../src/adapters/outbound/persistence/mongoose/pages/page-publication.adapter.js';
import {
  type IPagePublicationsRecord,
  pagePublicationsSchema,
} from '../../src/adapters/outbound/persistence/mongoose/pages/page-publications.schema.js';
import { pageFixture } from '../support/pages.js';

describe('atomic page publication boundary', () => {
  it('updates a captured page and retains exactly the newest three versions inside one transaction', async () => {
    const connection = createConnection();
    const pages = connection.model<IPageRecord>('Page', pageSchema);
    const publications = connection.model<IPagePublicationsRecord>('PagePublications', pagePublicationsSchema);
    const client = new mongo.MongoClient('mongodb://localhost:27017');
    const session = client.startSession();

    vi.spyOn(connection, 'startSession').mockResolvedValue(session);
    vi.spyOn(session, 'startTransaction').mockImplementation(() => {});
    vi.spyOn(session, 'commitTransaction').mockResolvedValue(undefined);
    vi.spyOn(session, 'abortTransaction').mockResolvedValue(undefined);
    vi.spyOn(session, 'endSession').mockResolvedValue(undefined);
    const pageQuery = pages.updateOne({}, {});

    vi.spyOn(pageQuery, 'exec').mockResolvedValue({
      acknowledged: true,
      matchedCount: 1,
      modifiedCount: 1,
      upsertedCount: 0,
      upsertedId: null,
    });
    vi.spyOn(pages, 'updateOne').mockReturnValue(pageQuery);
    const publicationQuery = publications.updateOne({}, {});

    vi.spyOn(publicationQuery, 'exec').mockResolvedValue({
      acknowledged: true,
      matchedCount: 1,
      modifiedCount: 1,
      upsertedCount: 0,
      upsertedId: null,
    });
    const update = vi.spyOn(publications, 'updateOne').mockReturnValue(publicationQuery);
    const adapter = new MongoosePagePublicationAdapter(pages, publications);

    try {
      const result = await adapter.publish(pageFixture().toState(), new Date('2026-10-24T15:00:00Z'));

      expect(result.status).toBe('PUBLISHED');
      const frozen = await adapter.publish({ ...pageFixture().toState(), tvValues: {} },
        new Date('2026-10-24T15:30:00Z'), undefined, { note: 'Frozen default' });

      expect(frozen.toState()).toMatchObject({ tvValues: { note: 'Frozen default' }, authoredTvValues: {} });
      expect(update).toHaveBeenCalledWith({ _id: 'page-1', siteId: 'site-1' },
        expect.objectContaining({ $push: { versions: expect.objectContaining({ $slice: 3, $position: 0 }) } }),
        expect.objectContaining({ session, upsert: true }));
      expect(session.commitTransaction).toHaveBeenCalledTimes(2);
      const writeConflict = Object.assign(new Error('Aborted write conflict'), { code: 112 });

      vi.mocked(pageQuery.exec).mockRejectedValueOnce(writeConflict);
      await expect(adapter.publish(pageFixture().toState(), new Date('2026-10-24T16:00:00Z')))
        .resolves.toMatchObject({ status: 'PUBLISHED' });
      expect(session.abortTransaction).toHaveBeenCalledOnce();
      expect(session.commitTransaction).toHaveBeenCalledTimes(3);
      vi.mocked(pageQuery.exec).mockRejectedValueOnce(writeConflict).mockResolvedValueOnce({
        acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0, upsertedId: null,
      });
      await expect(adapter.publish(pageFixture().toState(), new Date()))
        .rejects.toThrow('Page changed before publication');
      expect(session.commitTransaction).toHaveBeenCalledTimes(3);
      vi.mocked(session.abortTransaction).mockClear();
      const error = new Error('Unknown commit');

      vi.mocked(session.commitTransaction).mockRejectedValueOnce(error);
      await expect(adapter.publish(pageFixture().toState(), new Date())).rejects.toBe(error);
      expect(session.abortTransaction).not.toHaveBeenCalled();

      const selected = pageFixture();
      const draft = pageFixture();

      selected.publish(new Date('2026-10-24T15:00:00Z'));
      draft.restorePublishedContent(selected.toState());
      const retained = publications.findOne({});
      const read = retained.session(session).lean();

      vi.spyOn(read, 'exec').mockResolvedValue({
        _id: selected.pageId,
        siteId: selected.siteId,
        __v: 0,
        versions: [{ publishedAt: selected.publishedAt!, page: selected.toState() }],
      });
      vi.spyOn(publications, 'findOne').mockReturnValue(retained);
      vi.mocked(pageQuery.exec).mockRejectedValueOnce(writeConflict).mockResolvedValue({
        acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0, upsertedId: null,
      });
      await expect(adapter.restore(pageFixture().toState(), selected.toState(), 1, draft, new Date()))
        .resolves.toMatchObject({ status: 'DRAFT' });
      expect(session.abortTransaction).toHaveBeenCalledOnce();
    } finally {
      await client.close();
      await connection.close();
    }
  });
});
