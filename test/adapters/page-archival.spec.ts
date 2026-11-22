import { createConnection } from 'mongoose';
import { vi } from 'vitest';

import { type IPageRecord, pageSchema } from '../../src/adapters/outbound/persistence/mongoose/pages/page.schema.js';
import {
  MongoosePageArchivalAdapter,
} from '../../src/adapters/outbound/persistence/mongoose/pages/page-archival.adapter.js';
import { pageFixture } from '../support/pages.js';
import { instant } from '../support/sites.js';

it('archives through an owned full-snapshot comparison and leaves stale writes unchanged', async () => {
  const model = createConnection().model<IPageRecord>('Page', pageSchema);
  const query = model.findOneAndUpdate();
  const page = pageFixture();

  page.archive();
  const { pageId, ...fields } = page.toState();

  vi.spyOn(query, 'exec').mockResolvedValue(model.hydrate({ ...fields, _id: pageId, markKey: 'home' }));
  const update = vi.spyOn(model, 'findOneAndUpdate').mockReturnValue(query);
  const adapter = new MongoosePageArchivalAdapter(model, () => instant);

  expect((await adapter.archive(pageFixture().toState())).status).toBe('ARCHIVED');
  expect(update.mock.calls[0]?.[0]).toMatchObject({
    _id: pageId,
    siteId: 'site-1',
    status: 'DRAFT',
    mimeType: { $in: [null, 'text/html'] },
    excludeFromSitemap: { $in: [null, false] },
  });
  expect(update.mock.calls[0]?.[1]).toEqual({ $set: { status: 'ARCHIVED', updatedAt: instant } });
  vi.mocked(query.exec).mockResolvedValueOnce(null);
  await expect(adapter.archive(pageFixture().toState())).rejects.toMatchObject({ name: 'PageConflictError' });
});

