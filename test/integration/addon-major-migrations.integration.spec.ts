import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { type Connection, createConnection } from 'mongoose';

import { MongooseAddonWriteFence }
  from '../../src/adapters/outbound/persistence/mongoose/addons/addon-write-fence.adapter.js';
import { applyMigrations, migrationReceiptCollection }
  from '../../src/adapters/outbound/persistence/mongoose/migrations.js';
import { AddonPackageRegistry } from '../../src/adapters/outbound/runtime/addons/addon-package-registry.js';
import { LiveAddonUpdates } from '../../src/adapters/outbound/runtime/addons/live-addon-updates.adapter.js';

interface IFixtureRecord {
  readonly _id: string;
  readonly siteId: string;
  readonly label: string;
  readonly viewed?: true;
  readonly copy?: string;
}

it('squashes applied add-on migrations during an exclusive upgrade and a clean install', async () => {
  const uri = process.env.ZARYA_TEST_MONGO_URI;

  if (!uri || new URL(uri).hostname !== '127.0.0.1') {
    throw new Error('An explicit loopback test replica set is required');
  }

  const name = 'zarya_test_' + randomUUID().replaceAll('-', '');
  const freshName = name + '_fresh';

  await mkdir('.tmp', { recursive: true });
  const root = await mkdtemp(path.resolve('.tmp/addon-major-'));
  const connection = await createConnection(uri, { dbName: name, autoCreate: false, autoIndex: false }).asPromise();
  const fresh = connection.useDb(freshName);
  const key = 'major-fixture';
  const collection = 'major_records';
  const receiptName = migrationReceiptCollection(AddonPackageRegistry.migrationOwner(key));
  const server = `exports.validateConfiguration = () => {};
exports.defaultConfiguration = () => ({schemaVersion: 1, values: {}});
exports.createRuntime = () => ({canHandle: () => false, handle: async () => {}});`;
  const digest = (bytes: string): string => createHash('sha256').update(bytes).digest('hex');
  const schema = (extended: boolean): Record<string, unknown> => ({
    name: collection,
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['_id', 'siteId', 'label', ...(extended ? ['copy'] : [])],
        additionalProperties: false,
        properties: {
          _id: { bsonType: 'string' },
          siteId: { bsonType: 'string' },
          label: { bsonType: 'string' },
          viewed: { bsonType: 'bool' },
          ...(extended ? { copy: { bsonType: 'string' } } : {}),
        },
      },
    },
    indexes: [{ name: 'major_site_label', key: { siteId: 1, label: 1 }, unique: true }],
    ...(extended ? { fieldDefaults: { copy: 'label' } } : {}),
  });
  const old = {
    '0000-runtime': JSON.stringify({ id: '0000-runtime', collections: [schema(false)] }),
    '0001-viewed': JSON.stringify({ id: '0001-viewed', collections: [schema(false)] }),
  };
  const history = Object.fromEntries(Object.entries(old).map(([id, bytes]) => [id, digest(bytes)]));

  async function fixture(label: string, version: string, migrations: Record<string, string>,
    fromVersion?: string): Promise<string> {
    const directory = path.join(root, label);

    await mkdir(path.join(directory, 'migrations'), { recursive: true });
    await writeFile(path.join(directory, 'server.cjs'), server);
    const files: Record<string, string> = { 'server.cjs': digest(server) };

    for (const [id, bytes] of Object.entries(migrations)) {
      const file = 'migrations/' + id + '.json';

      await writeFile(path.join(directory, file), bytes);
      files[file] = digest(bytes);
    }
    await writeFile(path.join(directory, 'addon.runtime.json'), JSON.stringify({
      format: 'zarya-addon',
      version: 1,
      cmsVersion: '0.16.0',
      files,
      definition: {
        addonKey: key,
        implementationVersion: version,
        name: { en: 'Fixture', ru: 'Fixture' },
        description: { en: 'Fixture', ru: 'Fixture' },
        configurationSchemaVersion: 1,
        contractVersion: 1,
        snippetIds: [],
        adminComponentId: null,
      },
      routes: ['/api/major-fixture'],
      collections: [{ name: collection, references: [] }],
      serverEntry: 'server.cjs',
      adminEntry: null,
      styles: [],
      dependencies: {},
      ...(fromVersion ? { update: { fromVersion, mode: 'Exclusive' } } : {}),
    }));

    return directory;
  }

  function registry(database: Connection, directory: string): AddonPackageRegistry {
    return new AddonPackageRegistry(directory, database, [], {
      cmsVersion: '0.16.0',
      connection: database,
      origin: null,
      current: null,
      users: null,
      sites: { execute: vi.fn() },
      publications: { stage: vi.fn(), read: vi.fn() },
      activation: { getActive: vi.fn(), activate: vi.fn(), findActivation: vi.fn() },
      fence: new MongooseAddonWriteFence(database),
      policy: vi.fn(),
      requirePage: vi.fn(),
      secret: vi.fn(),
    });
  }

  const installed = path.join(root, 'installed');
  const packages = registry(connection, installed);
  const freshPackages = registry(fresh, path.join(root, 'fresh'));

  try {
    await applyMigrations(connection, 'migrations');
    const before = await fixture('old', '0.3.0', old);
    const baseline = (replaces: Record<string, string>): Record<string, string> => ({
      '0000-runtime-v1': JSON.stringify({ id: '0000-runtime-v1', replaces, collections: [schema(true)] }),
    });
    const candidate = await fixture('candidate', '1.0.0', baseline(history), '0.3.0');
    const wrong = await fixture('wrong', '1.0.0', baseline({ ...history, '0001-viewed': 'a'.repeat(64) }), '0.3.0');

    await packages.install(before);
    const records = connection.db!.collection<IFixtureRecord>(collection);

    await records.insertMany([
      { _id: 'read', siteId: 'one', label: 'Previously viewed', viewed: true },
      { _id: 'unread', siteId: 'two', label: 'Previously unread' },
    ]);
    const updates = new LiveAddonUpdates(installed, connection, packages, async () => [], async () => async () => {});
    const receiptRows = connection.db!.collection<{ _id: string; checksum: string }>(receiptName);
    const prior = await receiptRows.find({}).sort({ _id: 1 }).toArray();

    await expect(updates.prepare(wrong)).rejects.toThrow('Applied migration receipts');
    expect(await receiptRows.find({}).sort({ _id: 1 }).toArray()).toEqual(prior);
    const proposal = await updates.prepare(candidate);

    await updates.begin(proposal.updateId, 'synthetic');
    await updates.pause(proposal);
    await updates.migrate(proposal);
    await updates.migrate(proposal);
    await updates.activate(proposal);
    await updates.complete(proposal, 0);

    expect(JSON.parse(await readFile(path.join(installed, key + '.json'), 'utf8')).digest).toBe(proposal.toDigest);
    expect(await records.find({}).sort({ _id: 1 }).toArray()).toEqual([
      { _id: 'read', siteId: 'one', label: 'Previously viewed', viewed: true, copy: 'Previously viewed' },
      { _id: 'unread', siteId: 'two', label: 'Previously unread', copy: 'Previously unread' },
    ]);
    expect(await receiptRows.find({ _id: { $in: Object.keys(history) } }).sort({ _id: 1 }).toArray()).toEqual(prior);
    expect(await receiptRows.countDocuments({ _id: '0000-runtime-v1' })).toBe(1);

    const upgraded = registry(connection, installed);

    try {
      await upgraded.initialize();
      const patch = await fixture('patch', '1.0.1', baseline(history), '1.0.0');
      const next = new LiveAddonUpdates(installed, connection, upgraded, async () => [], async () => async () => {});

      await expect(next.prepare(patch)).resolves.toMatchObject({ fromVersion: '1.0.0', toVersion: '1.0.1' });
    } finally {
      await upgraded.close();
    }

    await freshPackages.install(candidate);
    expect(await fresh.db!.collection(receiptName).countDocuments()).toBe(1);
    await freshPackages.verify(key);
  } finally {
    await Promise.all([packages.close(), freshPackages.close()]);
    expect(fresh.name).toBe(freshName);
    expect(connection.name).toBe(name);
    await fresh.dropDatabase();
    await connection.dropDatabase();
    await connection.close();
    expect(path.dirname(root)).toBe(path.resolve('.tmp'));
    await rm(root, { recursive: true, force: true });
  }
});
