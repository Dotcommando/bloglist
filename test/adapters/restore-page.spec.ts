import { createConnection, mongo } from 'mongoose';

import { type IPageRecord, pageSchema } from '../../src/adapters/outbound/persistence/mongoose/pages/page.schema.js';
import {
  MongoosePagePublicationAdapter,
} from '../../src/adapters/outbound/persistence/mongoose/pages/page-publication.adapter.js';
import {
  type IPagePublicationsRecord,
  pagePublicationsSchema,
} from '../../src/adapters/outbound/persistence/mongoose/pages/page-publications.schema.js';
import { PublishedVersionPosition } from '../../src/domain/pages/published-page-version.js';
import { pageFixture } from '../support/pages.js';
import { instant } from '../support/sites.js';

describe('atomic retained version restoration', () => {
  it('guards both captured records and rolls back the draft on a version conflict', async () => {
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
    const update = pages.updateOne({}, {});

    vi.spyOn(update, 'exec').mockResolvedValue({
      acknowledged: true,
      matchedCount: 1,
      modifiedCount: 1,
      upsertedCount: 0,
      upsertedId: null,
    });
    vi.spyOn(pages, 'updateOne').mockReturnValue(update);
    const selected = pageFixture();

    selected.changeOpenGraph({ ogTitle: 'Retained social title', ogImage: 'https://example.test/share.webp' });
    selected.publish(instant);
    const draft = pageFixture();

    draft.restorePublishedContent(selected.toState());
    const query = publications.findOne();

    vi.spyOn(query, 'exec').mockResolvedValue(new publications({
      _id: 'page-1',
      siteId: 'site-1',
      versions: [{ page: selected.toState(), publishedAt: instant }],
    }));
    vi.spyOn(publications, 'findOne').mockReturnValue(query);
    const historyWrite = vi.spyOn(publications, 'updateOne');

    try {
      const adapter = new MongoosePagePublicationAdapter(pages, publications);

      expect((await adapter.restore(pageFixture().toState(), selected.toState(),
        PublishedVersionPosition.Latest, draft, instant)).status)
        .toBe('DRAFT');
      expect(session.commitTransaction).toHaveBeenCalledOnce();
      expect(vi.mocked(pages.updateOne).mock.calls[0]?.[1]).toMatchObject({
        $set: { ogTitle: 'Retained social title', ogImage: 'https://example.test/share.webp' },
      });
      expect(historyWrite).not.toHaveBeenCalled();
      vi.mocked(query.exec).mockResolvedValueOnce(null);
      await expect(adapter.restore(pageFixture().toState(), selected.toState(),
        PublishedVersionPosition.Latest, draft, instant))
        .rejects.toThrow();
      expect(session.abortTransaction).toHaveBeenCalledOnce();
    } finally {
      await connection.close();
      await client.close();
    }
  });
});
