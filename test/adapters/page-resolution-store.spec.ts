import { createConnection } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';

import {
  MongoosePageResolutionStore,
} from '../../src/adapters/outbound/persistence/mongoose/diagnostics/page-resolution-store.adapter.js';

describe('page resolution persistence translation', () => {
  it('scopes aggregate and versions and allows disk sorting', async () => {
    const connection = createConnection();
    const store = new MongoosePageResolutionStore(connection);
    const model = connection.model('PageResolution');
    const aggregate = model.aggregate();
    const distinct = model.distinct('cmsVersion');

    vi.spyOn(aggregate, 'exec').mockResolvedValue([]);
    vi.spyOn(distinct, 'exec').mockResolvedValue(['0.10.1']);
    const aggregateSpy = vi.spyOn(model, 'aggregate').mockReturnValue(aggregate);
    const distinctSpy = vi.spyOn(model, 'distinct').mockReturnValue(distinct);
    const from = new Date('2026-11-07T00:00:00Z');
    const until = new Date('2026-11-08T00:00:00Z');

    expect(await store.statistics({
      siteId: 'one', from, until, cmsVersion: '0.10.1',
    })).toEqual({ rows: [], versions: ['0.10.1'] });
    expect(aggregateSpy.mock.calls[0]?.[0]?.[0]).toEqual({
      $match: { siteId: 'one', startedAt: { $gte: from, $lt: until }, cmsVersion: '0.10.1' },
    });
    expect(distinctSpy).toHaveBeenCalledWith('cmsVersion', {
      siteId: 'one', startedAt: { $gte: from, $lt: until },
    });
    expect(aggregate.options.allowDiskUse).toBe(true);
    await connection.close();
  });
});
