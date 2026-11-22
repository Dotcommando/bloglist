import { createConnection } from 'mongoose';
import { vi } from 'vitest';

import { createRoutingModels } from '../../src/adapters/outbound/persistence/mongoose/routing/routing.models.js';
import { MongooseUrlRepository } from '../../src/adapters/outbound/persistence/mongoose/routing/url.repository.js';
import { prepareBehavior } from '../../src/app/services/routing/url-behavior.service.js';
import { urlFixture } from '../support/routing.js';
import { instant } from '../support/sites.js';
import { behaviorFixture } from '../support/url-behavior.js';

describe('retained URL persistence', () => {
  it('returns a scoped stable legacy version without leaking persistence fields', async () => {
    const models = createRoutingModels(createConnection());
    const { urlId, ...state } = urlFixture().toState();
    const query = models.urls.findOne();

    vi.spyOn(query, 'exec').mockResolvedValue(models.urls.hydrate({ ...state, _id: urlId, markKey: 'oldaddress' }));
    const find = vi.spyOn(models.urls, 'findOne').mockReturnValue(query);
    const adapter = new MongooseUrlRepository(models, () => instant, () => 'history');
    const first = await adapter.findVersionedUrl('site-1', urlId);

    expect(first).toEqual(await adapter.findVersionedUrl('site-1', urlId));
    expect(first?.version).toMatch(/^legacy:[a-f0-9]{64}$/);
    expect(first?.url).toEqual(urlFixture().toState());
    expect(find).toHaveBeenCalledWith({ _id: urlId, siteId: 'site-1' });
  });
  it('rejects changed immutable identity before opening a transaction', async () => {
    const models = createRoutingModels(createConnection());
    const start = vi.spyOn(models.connection, 'startSession').mockRejectedValue(new Error('Unexpected transaction'));
    const f = behaviorFixture();
    const change = prepareBehavior({ url: urlFixture().toState(), version: 'v1' }, urlFixture(), f.values);
    const adapter = new MongooseUrlRepository(models, () => instant, () => 'history');

    await expect(adapter.commitBehaviorChange({ ...change, next: { ...change.next, path: '/different' } })).rejects.toThrow(/identity/i);
    expect(start).not.toHaveBeenCalled();
  });
});
