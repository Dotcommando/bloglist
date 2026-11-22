import {
  GetPublicationOptionsUseCase,
} from '../../../src/app/use-cases/publication/get-publication-options.use-case.js';
import { source } from '../../support/publication.js';
import { siteFixture } from '../../support/sites.js';

it('rejects mixed editorial and routing snapshots when publication changes during the read', async () => {
  const operation = new GetPublicationOptionsUseCase({ execute: async () => siteFixture() },
    { execute: async () => null }, { read: async () => source('Home') }, { readUrls: async () => [] }, {
      readActive: async () => ({ releaseId: 'before', routes: [], sitemapPaths: null }),
    }, {
      execute: async () => ({
        releaseId: 'after',
        pages: [],
        publishedPage: null,
        robotsHasUnpublishedChanges: false,
      }),
    });

  await expect(operation.execute({ siteId: 'site-1' })).rejects.toMatchObject({ code: 'StaleWrite' });
});
