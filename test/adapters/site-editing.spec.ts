import { createConnection } from 'mongoose';
import { vi } from 'vitest';

import { type IPageRecord, pageSchema } from '../../src/adapters/outbound/persistence/mongoose/pages/page.schema.js';
import {
  MongoosePageCreationAdapter,
} from '../../src/adapters/outbound/persistence/mongoose/pages/page-creation.adapter.js';
import {
  PageLanguageUsageAdapter,
} from '../../src/adapters/outbound/persistence/mongoose/pages/page-language-usage.adapter.js';
import {
  MongooseSiteUpdateStore,
} from '../../src/adapters/outbound/persistence/mongoose/sites/site-update-store.adapter.js';
import { pageFixture } from '../support/pages.js';
import { siteFixture } from '../support/sites.js';

describe('site editing persistence', () => {
  it('does not insert a page if its guarded transaction cannot start', async () => {
    const connection = createConnection();
    const model = connection.model<IPageRecord>('Page', pageSchema);

    vi.spyOn(connection, 'startSession').mockRejectedValue(new Error('Transactions unavailable'));
    const insert = vi.spyOn(model, 'insertOne');
    const guard = vi.fn();

    await expect(new MongoosePageCreationAdapter(model, guard).create(pageFixture()))
      .rejects.toThrow('Transactions unavailable');
    expect(insert).not.toHaveBeenCalled();
    expect(guard).not.toHaveBeenCalled();
  });
  it('scopes language usage across every page status and preserves query failures', async () => {
    const connection = createConnection();
    const model = connection.model<IPageRecord>('Page', pageSchema);
    const query = model.exists({});

    vi.spyOn(query, 'exec').mockResolvedValue({ _id: 'page-1' });
    const exists = vi.spyOn(model, 'exists').mockReturnValue(query);
    const usage = new PageLanguageUsageAdapter(model, null);

    expect(await usage.hasPages('site-1', ['ru'])).toBe(true);
    expect(exists).toHaveBeenCalledWith({ siteId: 'site-1', language: { $in: ['ru'] } });
    vi.mocked(query.exec).mockRejectedValueOnce(new Error('Unavailable'));
    await expect(usage.hasPages('site-1', ['ru'])).rejects.toThrow('Unavailable');
  });
  it('does not save without a transaction', async () => {
    const connection = createConnection();

    vi.spyOn(connection, 'startSession').mockRejectedValue(new Error('Unavailable'));
    const usage = vi.fn();
    const store = new MongooseSiteUpdateStore(connection, usage, () => new Date());

    await expect(store.saveUpdate(siteFixture().toState(), siteFixture())).rejects.toThrow('Unavailable');
    expect(usage).not.toHaveBeenCalled();
  });
});
