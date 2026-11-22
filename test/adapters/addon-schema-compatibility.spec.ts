import { expect, it } from 'vitest';

import { assertCompatibleAddonSchema } from '../../src/adapters/outbound/runtime/addons/addon-schema-compatibility.js';

it('allows optional fields; rejects required fields, type changes and new unique indexes during overlap', () => {
  const previous = {
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['siteId', 'value'],
        additionalProperties: false,
        properties: { siteId: { bsonType: 'string' }, value: { bsonType: 'string' } },
      },
    },
    indexes: [],
  };
  const optional = structuredClone(previous);

  Object.assign(optional.validator.$jsonSchema.properties, { note: { bsonType: 'string' } });
  expect(() => assertCompatibleAddonSchema(previous, optional)).not.toThrow();
  const required = structuredClone(optional);

  required.validator.$jsonSchema.required.push('note');
  expect(() => assertCompatibleAddonSchema(previous, required)).toThrow();
  const changed = structuredClone(previous);

  changed.validator.$jsonSchema.properties.value.bsonType = 'int';
  expect(() => assertCompatibleAddonSchema(previous, changed)).toThrow();
  expect(() => assertCompatibleAddonSchema(previous, {
    ...previous,
    indexes: [{ name: 'unique_value', key: { value: 1 }, unique: true }],
  })).toThrow();
});
