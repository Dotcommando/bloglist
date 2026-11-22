import { requiresSiteId } from '../../src/adapters/outbound/persistence/mongoose/site-owned-schema.js';

describe('site-owned database schema detection', () => {
  it('includes ownership requirements inside compound validators without admitting mixed global branches', () => {
    const owned = { $jsonSchema: { required: ['_id', 'siteId'] } };
    const global = { $jsonSchema: { required: ['_id'] } };

    expect(requiresSiteId(owned)).toBe(true);
    expect(requiresSiteId({ $and: [global, owned, { $expr: true }] })).toBe(true);
    expect(requiresSiteId({ $or: [owned, owned] })).toBe(true);
    expect(requiresSiteId({ $or: [global, owned] })).toBe(false);
    expect(requiresSiteId(global)).toBe(false);
  });
});
