import { expect, it } from 'vitest';

import { readMongoPoolSize } from '../../src/infra/persistence/persistence.providers.js';

it('configures each process pool without an aggregate connection-derived process cap', () => {
  expect(readMongoPoolSize({})).toBe(5);
  expect(readMongoPoolSize({ ZARYA_MONGO_MAX_POOL_SIZE: '25' })).toBe(25);
  expect(readMongoPoolSize({ ZARYA_MONGO_MAX_POOL_SIZE: '1000' })).toBe(1000);

  for (const value of ['0', '-1', '1.5', 'invalid']) {
    expect(() => readMongoPoolSize({ ZARYA_MONGO_MAX_POOL_SIZE: value })).toThrow();
  }
});
