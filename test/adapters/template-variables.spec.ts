import { createConnection } from 'mongoose';

import {
  type ITemplateVariableRecord,
  MongooseTemplateVariables,
  templateVariableSchema,
} from '../../src/adapters/outbound/persistence/mongoose/template-variables/template-variables.adapter.js';

describe('TV persistence boundary', () => {
  it('scopes reads and guarded updates by site and maps lost writes to Conflict', async () => {
    const model = createConnection().model<ITemplateVariableRecord>('TvTest', templateVariableSchema);
    const query = model.findOne();
    const findOne = vi.spyOn(model, 'findOne').mockReturnValue(query);

    vi.spyOn(query, 'lean').mockReturnValue(query);
    vi.spyOn(query, 'exec').mockResolvedValue(null);
    const update = model.updateOne({}, {});
    const updateOne = vi.spyOn(model, 'updateOne').mockReturnValue(update);

    vi.spyOn(update, 'exec').mockResolvedValue({
      acknowledged: true,
      matchedCount: 0,
      modifiedCount: 0,
      upsertedCount: 0,
      upsertedId: null,
    });
    const adapter = new MongooseTemplateVariables(model);

    expect(await adapter.read('site-1')).toEqual({ siteId: 'site-1', version: '0', fields: [] });
    expect(findOne).toHaveBeenCalledWith({ _id: 'site-1', siteId: 'site-1' });
    await expect(adapter.save({ siteId: 'site-1', version: 'v2', fields: [] }, 'v1'))
      .rejects.toMatchObject({ code: 'Conflict' });
    expect(updateOne.mock.calls[0]?.[0]).toEqual({ _id: 'site-1', siteId: 'site-1', version: 'v1' });
  });
});
