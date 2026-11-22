import { createConnection } from 'mongoose';
import { vi } from 'vitest';

import { LocalPageAccessAdapter } from '../../src/adapters/outbound/access/local/pages/local-page-access.adapter.js';
import { PageSiteLookupAdapter } from '../../src/adapters/outbound/capabilities/sites/page-site-lookup.adapter.js';
import { MongoosePageRepository } from '../../src/adapters/outbound/persistence/mongoose/pages/page.repository.js';
import { type IPageRecord, pageSchema } from '../../src/adapters/outbound/persistence/mongoose/pages/page.schema.js';
import { PageLifecycleValuesAdapter } from '../../src/adapters/outbound/values/pages/page-lifecycle-values.adapter.js';
import { PageConflictError } from '../../src/domain/pages/page-conflict.error.js';
import { BrowserInteraction, HtmlDelivery } from '../../src/domain/pages/page-rendering.js';
import { PageStatus } from '../../src/domain/pages/page-status.enum.js';
import { PageType } from '../../src/domain/pages/page-type.enum.js';
import { BusinessErrorCode } from '../../src/domain/shared/business-error.js';
import type { IGetSiteInput } from '../../src/ports/inbound/sites/get-site.port.js';
import type { IPageCreationPort } from '../../src/ports/outbound/pages/page-creation.port.js';
import { pageFixture } from '../support/pages.js';
import { instant, siteFixture } from '../support/sites.js';

const unusedCreation: IPageCreationPort = {
  create: async () => {
    throw new Error('Unexpected creation while reading or updating an existing page');
  },
};

describe('page adapters', () => {
  it('persists and maps social metadata on existing pages', async () => {
    const model = createConnection().model<IPageRecord>('PageSeo', pageSchema);
    const original = pageFixture();
    const { pageId, ...state } = original.toState();
    const find = model.findOne();

    vi.spyOn(find, 'exec').mockResolvedValue(model.hydrate({ ...state, _id: pageId, markKey: 'home' }));
    vi.spyOn(model, 'findOne').mockReturnValue(find);
    const metadata = { ogTitle: 'Social', ogDescription: 'Description', ogImage: 'https://example.test/a.webp' };
    const updated = { ...state, ...metadata, _id: pageId, markKey: 'home' };
    const update = model.findOneAndUpdate();

    vi.spyOn(update, 'exec').mockResolvedValue(model.hydrate(updated));
    const write = vi.spyOn(model, 'findOneAndUpdate').mockReturnValue(update);

    original.changeOpenGraph(metadata);
    const saved = await new MongoosePageRepository(model, () => instant, unusedCreation).save(original);

    expect(saved.toState()).toMatchObject(metadata);
    expect(write.mock.calls[0]?.[1]).toMatchObject({ $set: metadata });
    expect(model.hydrate(updated).toObject()).toMatchObject(metadata);
  });
  it('delegates new-page persistence to the atomic site-language creation boundary', async () => {
    const model = createConnection().model<IPageRecord>('GuardedPage', pageSchema);
    const query = model.findOne();

    vi.spyOn(query, 'exec').mockResolvedValue(null);
    vi.spyOn(model, 'findOne').mockReturnValue(query);
    vi.spyOn(model, 'insertOne').mockRejectedValue(new Error('Direct insert bypassed the language guard'));
    const create = vi.fn(async () => pageFixture());
    const repository = new MongoosePageRepository(model, () => instant, { create });

    expect((await repository.save(pageFixture())).pageId).toBe('page-1');
    expect(create).toHaveBeenCalledOnce();
  });
  afterEach(() => vi.restoreAllMocks());

  it('retains declared empty parameter objects when serializing a document', () => {
    const model = createConnection().model<IPageRecord>('PageEmptyParameters', pageSchema);
    const { pageId, ...state } = pageFixture().toState();
    const document = model.hydrate({
      ...state,
      _id: pageId,
      markKey: 'home',
      rendering: {
        templateId: 'Home',
        delivery: HtmlDelivery.Static,
        interaction: BrowserInteraction.None,
        parameters: {},
        loaders: [],
      },
    });

    expect(document.toObject().rendering?.parameters).toEqual({});
  });

  it('maps explicit identity, nullable fields and rendering without exposing persistence fields', async () => {
    const model = createConnection().model<IPageRecord>('PageRead', pageSchema);
    const original = pageFixture();

    original.configureRendering({
      templateId: 'Home',
      delivery: HtmlDelivery.Static,
      interaction: BrowserInteraction.None,
      parameters: { title: 'Hello' },
      loaders: [],
    });
    const { pageId, ...state } = original.toState();
    const query = model.findOne();

    vi.spyOn(query, 'exec').mockResolvedValue(model.hydrate({ ...state, _id: pageId, markKey: 'home' }));
    const find = vi.spyOn(model, 'findOne').mockReturnValue(query);
    const result = await new MongoosePageRepository(model, () => instant, unusedCreation).findById(pageId);

    expect(result?.toState()).toEqual(original.toState());
    expect(result?.toState()).not.toHaveProperty('markKey');
    expect(find).toHaveBeenCalledWith({ _id: pageId });
  });

  it('builds explicit site filters, preserves null cluster filtering and implements every query', async () => {
    const model = createConnection().model<IPageRecord>('PageQueries', pageSchema);
    const query = model.findOne();

    vi.spyOn(query, 'exec').mockResolvedValue(null);
    const find = vi.spyOn(model, 'findOne').mockReturnValue(query);
    const all = model.find();

    vi.spyOn(all, 'exec').mockResolvedValue([]);
    const list = vi.spyOn(model, 'find').mockReturnValue(all);
    const repository = new MongoosePageRepository(model, () => instant, unusedCreation);

    expect(await repository.findByMark('site-1', 'hOME')).toBeNull();
    expect(find).toHaveBeenLastCalledWith({ siteId: 'site-1', markKey: 'home' });
    expect(await repository.findBySite('site-1', {
      clusterId: null,
      language: 'en',
      type: PageType.STATIC,
      status: PageStatus.DRAFT,
    })).toEqual([]);
    expect(list).toHaveBeenLastCalledWith({
      siteId: 'site-1',
      clusterId: null,
      language: 'en',
      type: PageType.STATIC,
      status: PageStatus.DRAFT,
    });
    expect(await repository.findBySite('site-1')).toEqual([]);
    expect(list).toHaveBeenLastCalledWith({ siteId: 'site-1' });
    expect(await repository.findByCluster('cluster-1')).toEqual([]);
    expect(list).toHaveBeenLastCalledWith({ clusterId: 'cluster-1' });
  });

  it('maps duplicate-key updates and preserves uncertain write outcomes without retry', async () => {
    const model = createConnection().model<IPageRecord>('PageConflict', pageSchema);
    const { pageId, ...state } = pageFixture().toState();
    const query = model.findOne();

    vi.spyOn(query, 'exec').mockResolvedValue(model.hydrate({ ...state, _id: pageId, markKey: 'home' }));
    vi.spyOn(model, 'findOne').mockReturnValue(query);
    const update = model.findOneAndUpdate();
    const failure = new Error('Unknown commit outcome');

    vi.spyOn(update, 'exec').mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: 11000 }))
      .mockRejectedValueOnce(failure);
    const write = vi.spyOn(model, 'findOneAndUpdate').mockReturnValue(update);
    const repository = new MongoosePageRepository(model, () => instant, unusedCreation);

    await expect(repository.save(pageFixture())).rejects.toBeInstanceOf(PageConflictError);
    await expect(repository.save(pageFixture())).rejects.toBe(failure);
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('cannot move an existing page into another site or replace immutable identity', async () => {
    const model = createConnection().model<IPageRecord>('PageImmutable', pageSchema);
    const { pageId, ...state } = pageFixture().toState();
    const query = model.findOne();

    vi.spyOn(query, 'exec').mockResolvedValue(model.hydrate({ ...state, _id: pageId, markKey: 'home' }));
    vi.spyOn(model, 'findOne').mockReturnValue(query);
    const update = vi.spyOn(model, 'findOneAndUpdate');
    const repository = new MongoosePageRepository(model, () => instant, unusedCreation);

    await expect(repository.save(pageFixture(pageId, 'foreign')))
      .rejects.toBeInstanceOf(PageConflictError);
    expect(update).not.toHaveBeenCalled();
  });

  it('updates with immutable guards and removes omitted rendering explicitly', async () => {
    const model = createConnection().model<IPageRecord>('PageUpdate', pageSchema);
    const { pageId, ...state } = pageFixture().toState();
    const record = { ...state, _id: pageId, markKey: 'home' };
    const query = model.findOne();

    vi.spyOn(query, 'exec').mockResolvedValue(model.hydrate(record));
    vi.spyOn(model, 'findOne').mockReturnValue(query);
    const updateQuery = model.findOneAndUpdate();

    vi.spyOn(updateQuery, 'exec').mockResolvedValue(model.hydrate(record));
    const update = vi.spyOn(model, 'findOneAndUpdate').mockReturnValue(updateQuery);

    await new MongoosePageRepository(model, () => instant, unusedCreation).save(pageFixture());
    expect(update.mock.calls[0]?.[0]).toMatchObject({ _id: pageId, siteId: 'site-1', mark: 'Home', language: 'en' });
    expect(update.mock.calls[0]?.[1]).toMatchObject({ $unset: { rendering: 1 } });
    expect(update.mock.calls[0]?.[2]).toMatchObject({ upsert: false, runValidators: true, returnDocument: 'after' });
  });

  it('obtains site references through the inbound site contract, retaining archived records', async () => {
    const archived = siteFixture();

    archived.archive();
    const execute = vi.fn<(input: IGetSiteInput) => Promise<typeof archived | null>>().mockResolvedValue(archived);
    const adapter = new PageSiteLookupAdapter({ execute });

    expect(await adapter.findSite('site-1')).toEqual({ siteId: 'site-1', languages: ['en', 'ru'] });
    expect(execute).toHaveBeenCalledWith({ siteId: 'site-1' });
    execute.mockResolvedValueOnce(null);
    expect(await adapter.findSite('missing')).toBeNull();
  });

  it('enforces local authority for both page access operations', async () => {
    const adapter = new LocalPageAccessAdapter({ operatorId: 'reader', platformAdministrator: false });

    await expect(adapter.assertCanCreatePage('site-1')).rejects.toMatchObject({ code: BusinessErrorCode.Forbidden });
    await expect(adapter.assertCanReadPage('site-1')).rejects.toMatchObject({ code: BusinessErrorCode.Forbidden });
    await expect(adapter.assertCanUpdatePage('site-1')).rejects.toMatchObject({ code: BusinessErrorCode.Forbidden });
  });

  it('generates page UUIDs and explicit instants outside application code', () => {
    const values = new PageLifecycleValuesAdapter();

    expect(values.nextPageId()).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/);
    expect(Number.isFinite(values.currentInstant().getTime())).toBe(true);
  });
});
