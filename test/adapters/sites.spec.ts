import { createConnection } from 'mongoose';
import { vi } from 'vitest';

import { LocalSiteAccessAdapter } from '../../src/adapters/outbound/access/local/sites/local-site-access.adapter.js';
import { MongooseSiteRepository } from '../../src/adapters/outbound/persistence/mongoose/sites/site.repository.js';
import { type ISiteRecord, siteSchema } from '../../src/adapters/outbound/persistence/mongoose/sites/site.schema.js';
import { SiteCreationValuesAdapter } from '../../src/adapters/outbound/values/sites/site-creation-values.adapter.js';
import { BusinessErrorCode } from '../../src/domain/shared/business-error.js';
import { instant, siteFixture } from '../support/sites.js';

describe('site adapters', () => {
  it('looks up the chosen serving authority without discarding its port', async () => {
    const model = createConnection().model<ISiteRecord>('SiteAuthority', siteSchema);
    const query = model.findOne();

    vi.spyOn(query, 'exec').mockResolvedValue(null);
    const find = vi.spyOn(model, 'findOne').mockReturnValue(query);

    expect(await new MongooseSiteRepository(model, () => instant).findByServingAuthority('localhost:3000')).toBeNull();
    expect(find).toHaveBeenCalledWith({ servingAuthority: 'localhost:3000' });
  });
  it('round-trips explicit public and local site origins through schema and boundary mapping', async () => {
    const connection = createConnection();
    const model = connection.model<ISiteRecord>('SiteAddresses', siteSchema);
    const changed = siteFixture();

    changed.changeAddresses({ publicOrigin: 'https://example.test', localOrigin: 'http://localhost:3100' });
    const { siteId, ...state } = changed.toState();
    const record = new model({ ...state, _id: siteId, markKey: state.mark.toLowerCase() });
    const query = model.findOne();

    vi.spyOn(query, 'exec').mockResolvedValue(record);
    vi.spyOn(model, 'findOne').mockReturnValue(query);
    expect((await new MongooseSiteRepository(model, () => instant).findById(siteId))?.toState().addresses)
      .toEqual(state.addresses);
  });
  afterEach(() => vi.restoreAllMocks());

  it('maps database identity into a detached domain entity', async () => {
    const model = createConnection().model<ISiteRecord>('SiteRead', siteSchema);
    const { siteId, ...state } = siteFixture().toState();
    const record = { ...state, languages: [...state.languages], _id: siteId, markKey: state.mark.toLowerCase() };
    const query = model.findOne();

    vi.spyOn(query, 'exec').mockResolvedValue(model.hydrate(record));
    const find = vi.spyOn(model, 'findOne').mockReturnValue(query);
    const repository = new MongooseSiteRepository(model, () => instant);
    const found = await repository.findById(siteId);

    expect(find).toHaveBeenCalledWith({ _id: siteId });
    expect(found?.toState()).toEqual(siteFixture().toState());
    record.languages.push('de');
    expect(found?.languages).toEqual(['en', 'ru']);
  });

  it('implements normalized mark/domain lookups and a complete list without status filtering', async () => {
    const model = createConnection().model<ISiteRecord>('SiteQueries', siteSchema);
    const query = model.findOne();

    vi.spyOn(query, 'exec').mockResolvedValue(null);
    const find = vi.spyOn(model, 'findOne').mockReturnValue(query);
    const all = model.find();

    vi.spyOn(all, 'exec').mockResolvedValue([]);
    const list = vi.spyOn(model, 'find').mockReturnValue(all);
    const repository = new MongooseSiteRepository(model, () => instant);

    expect(await repository.findByMark('EXAMPLE')).toBeNull();
    expect(find).toHaveBeenLastCalledWith({ markKey: 'example' });
    expect(await repository.findByPrimaryDomain('example.test')).toBeNull();
    expect(find).toHaveBeenLastCalledWith({ primaryDomain: 'example.test' });
    expect(await repository.findAll()).toEqual([]);
    expect(list).toHaveBeenCalledWith({});
  });

  it('inserts explicit fields and translates duplicate-key errors without retry', async () => {
    const model = createConnection().model<ISiteRecord>('SiteInsert', siteSchema);
    const query = model.findOne();

    vi.spyOn(query, 'exec').mockResolvedValue(null);
    vi.spyOn(model, 'findOne').mockReturnValue(query);
    const failure = Object.assign(new Error('duplicate'), { code: 11000 });
    const insert = vi.spyOn(model, 'insertOne').mockRejectedValue(failure);
    const repository = new MongooseSiteRepository(model, () => instant);

    await expect(repository.save(siteFixture())).rejects.toMatchObject({ code: BusinessErrorCode.Conflict });
    expect(insert).toHaveBeenCalledOnce();
    expect(insert.mock.calls[0]?.[0]).toMatchObject({ _id: 'site-1', markKey: 'example' });
    expect(insert.mock.calls[0]?.[0]).not.toHaveProperty('siteId');
  });

  it('preserves immutable identity on update and uses an acknowledged persisted result', async () => {
    const model = createConnection().model<ISiteRecord>('SiteUpdate', siteSchema);
    const original = siteFixture();
    const { siteId, ...state } = original.toState();
    const record = { ...state, _id: siteId, markKey: 'example' };
    const query = model.findOne();

    vi.spyOn(query, 'exec').mockResolvedValue(model.hydrate(record));
    vi.spyOn(model, 'findOne').mockReturnValue(query);
    const updatedAt = new Date('2026-10-24T11:00:00Z');
    const updateQuery = model.findOneAndUpdate();

    vi.spyOn(updateQuery, 'exec').mockResolvedValue(model.hydrate({ ...record, name: 'Changed', updatedAt }));
    const update = vi.spyOn(model, 'findOneAndUpdate').mockReturnValue(updateQuery);
    const repository = new MongooseSiteRepository(model, () => updatedAt);
    const changed = siteFixture();

    changed.changeName('Changed');
    expect((await repository.save(changed)).updatedAt).toEqual(updatedAt);
    expect(update.mock.calls[0]?.[0]).toMatchObject({ _id: siteId, mark: 'Example', createdAt: instant });
    expect(update.mock.calls[0]?.[2]).toMatchObject({ returnDocument: 'after', runValidators: true, upsert: false });
    expect(changed.updatedAt).toEqual(instant);
    await expect(repository.save(siteFixture(siteId, 'Different'))).rejects.toMatchObject({
      code: BusinessErrorCode.Conflict,
    });
  });

  it('does not mask dependency failures as absent records', async () => {
    const model = createConnection().model<ISiteRecord>('SiteFailure', siteSchema);
    const query = model.findOne();
    const failure = new Error('Database unavailable');

    vi.spyOn(query, 'exec').mockRejectedValue(failure);
    vi.spyOn(model, 'findOne').mockReturnValue(query);
    await expect(new MongooseSiteRepository(model, () => instant).findById('site-1')).rejects.toBe(failure);
  });

  it('grants explicit local-operator authority and rejects missing authority', async () => {
    await expect(new LocalSiteAccessAdapter({ operatorId: 'local', platformAdministrator: true })
      .assertCanCreateSite()).resolves.toBeUndefined();
    const denied = new LocalSiteAccessAdapter({ operatorId: 'reader', platformAdministrator: false });

    await expect(denied.assertCanCreateSite()).rejects.toMatchObject({ code: BusinessErrorCode.Forbidden });
    await expect(denied.assertCanReadSite('site-1')).rejects.toMatchObject({ code: BusinessErrorCode.Forbidden });
  });

  it('generates opaque UUIDs and actual UTC instants at the adapter boundary', () => {
    const values = new SiteCreationValuesAdapter();

    expect(values.nextSiteId()).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/);
    expect(values.nextSiteId()).not.toBe(values.nextSiteId());
    expect(Number.isFinite(values.currentInstant().getTime())).toBe(true);
  });
});
