import { createConnection } from 'mongoose';

import { type IPageRecord, pageSchema } from '../../src/adapters/outbound/persistence/mongoose/pages/page.schema.js';
import {
  MongoosePageContentSourceAdapter,
} from '../../src/adapters/outbound/persistence/mongoose/pages/page-content-source.adapter.js';
import {
  type IPagePublicationsRecord,
  pagePublicationsSchema,
} from '../../src/adapters/outbound/persistence/mongoose/pages/page-publications.schema.js';
import { pageFixture } from '../support/pages.js';

describe('page content source', () => {
  it('scopes working reads and serves stored publications instead of current drafts', async () => {
    const connection = createConnection();
    const pages = connection.model<IPageRecord>('Page', pageSchema);
    const publications = connection.model<IPagePublicationsRecord>('PagePublications', pagePublicationsSchema);
    const find = vi.spyOn(pages, 'findOne');
    const query = pages.findOne();

    vi.spyOn(query, 'exec').mockResolvedValue(null);
    find.mockReturnValue(query);
    const publishedQuery = publications.find();
    const publishedPage = pageFixture();

    publishedPage.publish(new Date());

    vi.spyOn(publishedQuery, 'exec').mockResolvedValue([new publications({
      _id: 'page-1',
      siteId: 'site-1',
      versions: [{ page: publishedPage.toState(), publishedAt: new Date() }],
    })]);
    vi.spyOn(publications, 'find').mockReturnValue(publishedQuery);
    const source = new MongoosePageContentSourceAdapter(pages, publications);

    expect(await source.readWorking('site-1', 'page-1')).toBeNull();
    expect(find).toHaveBeenLastCalledWith({ _id: 'page-1', siteId: 'site-1' });
    expect((await source.readPublished('site-1'))[0]?.title).toBe('Home');
    vi.mocked(publishedQuery.exec).mockResolvedValueOnce([new publications({
      _id: 'page-1', siteId: 'site-1', versions: [{ page: pageFixture().toState(), publishedAt: new Date() }],
    })]);
    await expect(source.readPublished('site-1')).rejects.toThrow();
    await connection.close();
  });
});
