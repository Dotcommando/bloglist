import { createConnection } from 'mongoose';

import {
  elementKeySchema, type IElementKeyRecord, MongooseElementKeys,
} from '../../src/adapters/outbound/persistence/mongoose/rendering/element-keys.adapter.js';
import { TemplateSourceKind } from '../../src/domain/publication/render-plan.js';

describe('exact rendering element ordinals', () => {
  it('reserves through one scoped atomic operation without converting identifiers through number', async () => {
    const model = createConnection().model<IElementKeyRecord>('ElementKeysUnit', elementKeySchema);
    const query = model.findOneAndUpdate();

    vi.spyOn(query, 'exec').mockResolvedValue(new model({
      _id: 'sequence', siteId: 'site-1', kind: TemplateSourceKind.Template, lastOrdinal: 9007199254740993n,
    }));
    const write = vi.spyOn(model, 'findOneAndUpdate').mockReturnValue(query);
    const keys = new MongooseElementKeys(model);

    expect(await keys.reserve({ siteId: 'site-1', kind: TemplateSourceKind.Template, after: 9007199254740992n }))
      .toBe('9007199254740993');
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({
      upsert: true, returnDocument: 'after', useBigInt64: true, updatePipeline: true,
    }));
    expect(write.mock.calls[0]?.[0]).toEqual({ _id: JSON.stringify(['site-1', 'Template']) });
  });

  it('propagates storage failures and rejects exhausted ranges without making a write', async () => {
    const model = createConnection().model<IElementKeyRecord>('ElementKeysFailure', elementKeySchema);
    const query = model.findOneAndUpdate();

    vi.spyOn(query, 'exec').mockRejectedValue(new Error('Unavailable'));
    const write = vi.spyOn(model, 'findOneAndUpdate').mockReturnValue(query);
    const keys = new MongooseElementKeys(model);

    await expect(keys.reserve({ siteId: 'site-1', kind: TemplateSourceKind.Chunk, after: 9223372036854775807n }))
      .rejects.toMatchObject({ code: 'Conflict' });
    expect(write).not.toHaveBeenCalled();
    await expect(keys.reserve({ siteId: 'site-1', kind: TemplateSourceKind.Chunk, after: 0n }))
      .rejects.toThrow('Unavailable');
  });
});
