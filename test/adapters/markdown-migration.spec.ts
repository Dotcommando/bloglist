import { readMigrations } from '../../src/adapters/outbound/persistence/mongoose/migrations.js';

it('extends the existing release validator without changing its indexes or other fields', async () => {
  const migrations = await readMigrations('migrations');
  const baseline = migrations.find((migration) => migration.id === '0000-schema-migrations')!;
  const added = migrations.find((migration) => migration.id === '0003-markdown-representations')!;
  const previous = baseline.collections.find((collection) => collection.name === 'publication_releases')!;
  const updated = added.collections.find((collection) => collection.name === 'publication_releases')!;
  const schema: { $jsonSchema: { properties: { manifest: { properties: {
    routes: { items: { properties: Record<string, unknown> } };
  } } } } } = JSON.parse(JSON.stringify(updated.validator));
  const properties = schema.$jsonSchema.properties.manifest.properties.routes.items.properties;

  expect(properties.markdownPath).toEqual({ bsonType: 'string', minLength: 1 });
  delete properties.markdownPath;
  expect(schema).toEqual(previous.validator);
  expect(updated.indexes).toEqual(previous.indexes);
  expect(updated.dumpRole).toBe(previous.dumpRole);
});
