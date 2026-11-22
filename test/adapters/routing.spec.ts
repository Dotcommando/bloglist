import { createConnection } from 'mongoose';
import { vi } from 'vitest';

import {
  LocalRoutingAccessAdapter,
} from '../../src/adapters/outbound/access/local/routing/local-routing-access.adapter.js';
import {
  RoutingPageLookupAdapter,
} from '../../src/adapters/outbound/capabilities/pages/routing-page-lookup.adapter.js';
import { createRoutingModels } from '../../src/adapters/outbound/persistence/mongoose/routing/routing.models.js';
import { MongooseUrlRepository } from '../../src/adapters/outbound/persistence/mongoose/routing/url.repository.js';
import { UrlCreationValuesAdapter } from '../../src/adapters/outbound/values/routing/url-creation-values.adapter.js';
import { PageScopeError } from '../../src/domain/pages/page-scope.error.js';
import { RoutingScopeError } from '../../src/domain/routing/routing-scope.error.js';
import type { IGetPageInput } from '../../src/ports/inbound/pages/get-page.port.js';
import { pageFixture } from '../support/pages.js';
import { urlFixture } from '../support/routing.js';
import { instant } from '../support/sites.js';

describe('routing adapters', () => {
  afterEach(() => vi.restoreAllMocks());

  it('maps identity and executes explicit current/mark/path/parent filters', async () => {
    const models = createRoutingModels(createConnection());
    const { urlId, ...state } = urlFixture().toState();
    const query = models.urls.findOne();

    vi.spyOn(query, 'exec').mockResolvedValue(models.urls.hydrate({ ...state, _id: urlId, markKey: 'oldaddress' }));
    const find = vi.spyOn(models.urls, 'findOne').mockReturnValue(query);
    const all = models.urls.find();

    vi.spyOn(all, 'exec').mockResolvedValue([]);
    const list = vi.spyOn(models.urls, 'find').mockReturnValue(all);
    const repository = new MongooseUrlRepository(models, () => instant, () => 'history-1');

    expect((await repository.findById(urlId))?.toState()).toEqual(urlFixture().toState());
    expect(find).toHaveBeenLastCalledWith({ _id: urlId });
    await repository.findByMark('OLDADDRESS');
    expect(find).toHaveBeenLastCalledWith({ markKey: 'oldaddress' });
    await repository.findByPath('site-1', '/games/old/');
    expect(find).toHaveBeenLastCalledWith({ siteId: 'site-1', path: '/games/old/' });
    await repository.findCurrentByPage('page-1');
    expect(find).toHaveBeenLastCalledWith({ pageId: 'page-1', kind: 'PAGE' });
    expect(await repository.findChildren(urlId)).toEqual([]);
    expect(list).toHaveBeenLastCalledWith({ siteId: 'site-1', parentUrlId: urlId });
  });

  it('does not mask failed reads as absence', async () => {
    const models = createRoutingModels(createConnection());
    const query = models.urls.findOne();
    const failure = new Error('Unavailable');

    vi.spyOn(query, 'exec').mockRejectedValue(failure);
    vi.spyOn(models.urls, 'findOne').mockReturnValue(query);
    await expect(new MongooseUrlRepository(models, () => instant, () => 'history-1').findById('url'))
      .rejects.toBe(failure);
  });

  it('uses the site-scoped GetPage port and translates ownership errors', async () => {
    const execute = vi.fn<(input: IGetPageInput) => Promise<ReturnType<typeof pageFixture> | null>>()
      .mockResolvedValue(pageFixture());
    const adapter = new RoutingPageLookupAdapter({ execute });

    expect(await adapter.findPage('site-1', 'page-1')).toEqual({ siteId: 'site-1', pageId: 'page-1' });
    expect(execute).toHaveBeenCalledWith({ siteId: 'site-1', pageId: 'page-1' });
    execute.mockRejectedValueOnce(new PageScopeError('Foreign'));
    await expect(adapter.findPage('site-1', 'page-1')).rejects.toBeInstanceOf(RoutingScopeError);
    execute.mockResolvedValueOnce(null);
    expect(await adapter.findPage('site-1', 'missing')).toBeNull();
  });

  it('checks all three permissions against explicit immutable local authority', async () => {
    const denied = new LocalRoutingAccessAdapter({ operatorId: 'reader', platformAdministrator: false });

    await expect(denied.assertCanAssignPageUrl('site-1')).rejects.toMatchObject({ code: 'Forbidden' });
    await expect(denied.assertCanChangePageUrl('site-1')).rejects.toMatchObject({ code: 'Forbidden' });
    await expect(denied.assertCanReadRouting('site-1')).rejects.toMatchObject({ code: 'Forbidden' });
    const allowed = new LocalRoutingAccessAdapter({ operatorId: 'operator', platformAdministrator: true });

    await expect(allowed.requireEditor('site-1', 'operator')).resolves.toBeUndefined();
    await expect(allowed.requireEditor('site-1', 'foreign')).rejects.toMatchObject({ code: 'Forbidden' });

    await expect(allowed.assertCanAssignPageUrl('site-1')).resolves.toBeUndefined();
    await expect(allowed.assertCanReadRouting('')).rejects.toThrow();
  });

  it('provides opaque IDs, valid generated marks and real instants outside app', () => {
    const values = new UrlCreationValuesAdapter();

    expect(values.nextUrlId()).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/);
    expect(values.nextUrlMark()).toMatch(/^[A-Za-z][A-Za-z0-9]*$/);
    expect(values.nextUrlMark()).not.toBe(values.nextUrlMark());
    expect(Number.isFinite(values.currentInstant().getTime())).toBe(true);
  });
});
