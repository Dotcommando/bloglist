import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import type { Connection, mongo } from 'mongoose';

import { migrateAddonRepositoryUpdateAction } from './authorization/addon-repository-update-action.migration.js';
import { migrateAddonWorkspaceActions } from './authorization/addon-workspace-actions.migration.js';
import { migrateAuthorization } from './authorization/authorization.migration.js';
import { migrateDumpAccess } from './authorization/dump-access.migration.js';
import { migratePageTree } from './pages/page-tree.migration.js';

enum MigrationTransform {
  PageTreeV1 = 'PageTreeV1',
  AuthorizationV1 = 'AuthorizationV1',
  DumpAccessV1 = 'DumpAccessV1',
  AddonWorkspaceActionsV1 = 'AddonWorkspaceActionsV1',
  AddonRepositoryUpdateActionV1 = 'AddonRepositoryUpdateActionV1',
}

enum MigrationDumpRole { SiteContent = 'SiteContent', Runtime = 'Runtime', Global = 'Global' }

interface IMigrationIndex {
  readonly key: Record<string, 1 | -1>;
  readonly name: string;
  readonly unique: boolean;
  readonly expireAfterSeconds?: 0;
  readonly partialFilterExpression?: Record<string, unknown>;
  readonly collation?: { readonly locale: 'en'; readonly strength: 2 };
}

interface IMigrationCollection {
  readonly dumpRole?: MigrationDumpRole;
  readonly name: string;
  readonly validator: Record<string, unknown>;
  readonly indexes: readonly IMigrationIndex[];
  readonly removedIndexes?: readonly string[];
  readonly fieldDefaults?: Readonly<Record<string, string>>;
}

interface IMigration {
  readonly transform?: MigrationTransform;
  readonly id: string;
  readonly checksum: string;
  readonly replaces?: Readonly<Record<string, string>>;
  readonly collections: readonly IMigrationCollection[];
}

interface IMigrationReceipt {
  readonly _id: string;
  readonly checksum: string;
  readonly appliedAt: Date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseIndex(value: unknown): IMigrationIndex {
  if (
    !isRecord(value)
    || typeof value.name !== 'string'
    || !isRecord(value.key)
    || (value.unique !== undefined
    && typeof value.unique !== 'boolean')
    || (value.partialFilterExpression !== undefined
    && !isRecord(value.partialFilterExpression))
  ) {
    throw new Error('Invalid migration index');
  }

  const key: Record<string, 1 | -1> = {};

  if (
    value.expireAfterSeconds !== undefined
    && (value.expireAfterSeconds !== 0
    || value.unique === true
    || Object.keys(value.key).length !== 1
    || value.key.expiresAt !== 1)
  ) {
    throw new Error('Unsupported migration expiry index');
  }
  if (
    value.collation !== undefined
    && (!isRecord(value.collation)
    || value.collation.locale !== 'en'
    || value.collation.strength !== 2
    || Object.keys(value.collation).length !== 2)
  ) {
    throw new Error('Unsupported migration collation');
  }

  for (const [field, direction] of Object.entries(value.key)) {
    if ((field !== '_id' && !/^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*$/.test(field)) || (direction !== 1 && direction !== -1)) {
      throw new Error('Invalid index key');
    }
    key[field] = direction;
  }

  if (!Object.keys(key).length) {
    throw new Error('Empty index key');
  }

  return {
    key,
    name: value.name,
    unique: value.unique === true,
    ...(value.expireAfterSeconds === 0 ? { expireAfterSeconds: 0 } : {}),
    ...(isRecord(value.partialFilterExpression) ? { partialFilterExpression: value.partialFilterExpression } : {}),
    ...(value.collation === undefined ? {} : { collation: { locale: 'en', strength: 2 } }),
  };
}

function parseCollection(value: unknown): IMigrationCollection {
  if (
    !isRecord(value)
    || typeof value.name !== 'string'
    || !/^[a-z][a-z0-9_]*$/.test(value.name)
    || !isRecord(value.validator)
    || !Array.isArray(value.indexes)
  ) {
    throw new Error('Invalid migration collection');
  }

  const dumpRole = Object.values(MigrationDumpRole).find((role) => role === value.dumpRole);

  if (value.dumpRole !== undefined && dumpRole === undefined) {
    throw new Error('Invalid migration dump role');
  }

  const indexes = value.indexes.map(parseIndex);
  const removedIndexes: string[] = [];

  if (value.removedIndexes !== undefined) {
    if (!Array.isArray(value.removedIndexes)) {
      throw new Error('Invalid retired migration indexes');
    }

    for (const name of value.removedIndexes) {
      if (
        typeof name !== 'string'
        || !/^[a-z][a-z0-9_]*$/.test(name)
        || removedIndexes.includes(name)
        || indexes.some((index) => index.name === name)
      ) {
        throw new Error('Invalid retired migration index');
      }
      removedIndexes.push(name);
    }
  }

  const fieldDefaults: Record<string, string> = {};

  if (value.fieldDefaults !== undefined) {
    if (!isRecord(value.fieldDefaults)) {
      throw new Error('Invalid migration field defaults');
    }

    for (const [field, from] of Object.entries(value.fieldDefaults)) {
      if (!/^[a-z][A-Za-z0-9]*$/.test(field) || typeof from !== 'string' || !/^[a-z][A-Za-z0-9]*$/.test(from)) {
        throw new Error('Invalid migration field defaults');
      }
      fieldDefaults[field] = from;
    }
  }

  return {
    name: value.name,
    ...(dumpRole === undefined ? {} : { dumpRole }),
    validator: value.validator,
    indexes,
    ...(value.removedIndexes === undefined ? {} : { removedIndexes }),
    ...(value.fieldDefaults === undefined ? {} : { fieldDefaults }),
  };
}

function parseMigrationHistory(id: string, value: unknown): Readonly<Record<string, string>> {
  if (
    !/^0000-runtime-v[1-9]\d*$/.test(id)
    || !isRecord(value)
    || !Object.keys(value).length
    || Object.keys(value).length > 10000
  ) {
    throw new Error('Invalid replaced migration history: ' + id);
  }

  return Object.fromEntries(Object.entries(value).map(([previous, checksum]) => {
    if (!/^\d{4}-[a-z0-9-]+$/.test(previous) || typeof checksum !== 'string' || !/^[a-f0-9]{64}$/.test(checksum)) {
      throw new Error('Invalid replaced migration receipt: ' + previous);
    }

    return [previous, checksum];
  }));
}

export async function readMigrations(directory: string): Promise<readonly IMigration[]> {
  const filenames = (await readdir(directory)).filter((name) => /^\d{4}-[a-z0-9-]+\.json$/.test(name)).sort();
  const migrations: IMigration[] = [];

  for (const filename of filenames) {
    const bytes = await readFile(path.join(directory, filename));
    const value: unknown = JSON.parse(bytes.toString('utf8'));
    const transform = isRecord(value)
      ? Object.values(MigrationTransform).find((item) => item === value.transform) : undefined;

    if (
      !isRecord(value)
      || value.id !== filename.slice(0, -5)
      || typeof value.id !== 'string'
      || !Array.isArray(value.collections)
      || transform === undefined
      && (!value.collections.length
      || value.transform !== undefined)
    ) {
      throw new Error(`Invalid migration: ${filename}`);
    }

    const replaces = value.replaces === undefined ? undefined : parseMigrationHistory(value.id, value.replaces);

    migrations.push({
      id: value.id,
      ...(replaces === undefined ? {} : { replaces }),
      checksum: createHash('sha256').update(bytes).digest('hex'),
      collections: value.collections.map(parseCollection),
      ...(transform === undefined ? {} : { transform }),
    });
  }

  const sequences = new Set(migrations.map((migration) => migration.id.slice(0, 4)));

  if (!migrations.length || sequences.size !== migrations.length) {
    throw new Error('Missing or duplicate migration sequence');
  }
  if (migrations[0]?.replaces && migrations.some(({ id }) => Object.hasOwn(migrations[0]!.replaces!, id))) {
    throw new Error('A current migration reuses a retired identity');
  }

  return migrations;
}

async function verifyCollection(connection: Connection, expected: IMigrationCollection): Promise<void> {
  const db = connection.db;

  if (!db) {
    throw new Error('MongoDB connection is not open');
  }

  const collection = await db.listCollections({ name: expected.name }).next();

  if (
    !collection
    || !('options' in collection)
    || !isDeepStrictEqual(collection.options?.validator, expected.validator)
    || collection.options?.validationLevel !== 'strict'
    || collection.options?.validationAction !== 'error'
  ) {
    throw new Error(`Missing or incompatible collection validator: ${expected.name}`);
  }

  const indexes = await db.collection(expected.name).indexes();

  for (const name of expected.removedIndexes ?? []) {
    if (indexes.some((index) => index.name === name)) {
      throw new Error('Retired index still exists: ' + name);
    }
  }

  for (const index of expected.indexes) {
    const actual = indexes.find((candidate) => candidate.name === index.name);

    if (
      !actual
      || !isDeepStrictEqual(actual.key, index.key)
      || (actual.unique === true) !== index.unique
      || !isDeepStrictEqual(actual.partialFilterExpression, index.partialFilterExpression)
      || actual.expireAfterSeconds !== index.expireAfterSeconds
    ) {
      throw new Error(`Missing or incompatible index: ${index.name}`);
    }
    if (
      index.collation ? actual.collation?.locale !== index.collation.locale
      || actual.collation?.strength !== index.collation.strength : actual.collation !== undefined
    ) {
      throw new Error(`Missing or incompatible index collation: ${index.name}`);
    }
  }

  if (await db.collection(expected.name).findOne({ $nor: [expected.validator] }, { projection: { _id: 1 } })) {
    throw new Error(`Existing records violate the schema: ${expected.name}`);
  }
}

export function migrationReceiptCollection(owner?: string): string {
  if (owner !== undefined && !/^[a-z][a-z0-9-]{0,63}$/.test(owner)) {
    throw new Error('Invalid migration owner');
  }

  return owner === undefined ? 'schema_migrations' : 'addon_' + owner.replaceAll('-', '_') + '_migrations';
}

async function verifyBaselineReceipts(receipts: mongo.Collection<IMigrationReceipt>, migrations: readonly IMigration[],
  history: Readonly<Record<string, string>>): Promise<void> {
  const active = new Map(migrations.map(({ id, checksum }) => [id, checksum]));
  const stored = await receipts.find({}).toArray();

  if (stored.some(({ _id, checksum }) => (active.get(_id) ?? history[_id]) !== checksum)) {
    throw new Error('An add-on migration receipt is unknown or has a different checksum');
  }
}

export async function verifyMigrations(connection: Connection, directory: string, owner?: string): Promise<void> {
  const db = connection.db;

  if (!db) {
    throw new Error('MongoDB connection is not open');
  }

  const migrations = await readMigrations(directory);
  const receipts = db.collection<IMigrationReceipt>(migrationReceiptCollection(owner));
  const latestCollections = new Map<string, IMigrationCollection>();
  const history = owner ? migrations[0]?.replaces : undefined;

  if (history) {
    await verifyBaselineReceipts(receipts, migrations, history);
  }

  for (const migration of migrations) {
    const receipt = await receipts.findOne({ _id: migration.id });

    if (receipt?.checksum !== migration.checksum) {
      throw new Error(`Missing or modified migration: ${migration.id}`);
    }

    for (const collection of migration.collections) {
      latestCollections.set(collection.name, collection);
    }
  }

  for (const collection of latestCollections.values()) {
    await verifyCollection(connection, collection);
  }

  if (!history && await receipts.countDocuments({ _id: { $nin: migrations.map(({ id }) => id) } })) {
    throw new Error('Database contains migrations unknown to this application');
  }
}

/** Runtime installation may create owned schemas, but cannot rewrite existing schemas or records. */
export async function verifyRuntimeMigrationCompatibility(connection: Connection, directory: string): Promise<void> {
  const migrations = await readMigrations(directory);

  for (const migration of migrations) {
    if (
      migration.transform
      || !migration.replaces
      && migration.collections.some((item) => item.fieldDefaults !== undefined
        || item.removedIndexes?.length)
    ) {
      throw new Error('Runtime migrations cannot transform existing records');
    }

    for (const collection of migration.collections) {
      if (await connection.db?.listCollections({ name: collection.name }).next()) {
        await verifyCollection(connection, collection);
      }
    }
  }
}

export async function applyMigrations(connection: Connection, directory: string, owner?: string): Promise<void> {
  const db = connection.db;

  if (!db) {
    throw new Error('MongoDB connection is not open');
  }

  const migrations = await readMigrations(directory);

  if (owner !== undefined && migrations.some((migration) => migration.transform !== undefined)) {
    throw new Error('Add-on migrations cannot apply core transformations');
  }

  const receipts = db.collection<IMigrationReceipt>(migrationReceiptCollection(owner));
  const history = owner ? migrations[0]?.replaces : undefined;

  if (history) {
    await verifyBaselineReceipts(receipts, migrations, history);
  }

  for (const migration of migrations) {
    const existing = await receipts.findOne({ _id: migration.id });

    if (existing && existing.checksum !== migration.checksum) {
      throw new Error(`Migration checksum differs: ${migration.id}`);
    }
    if (!existing) {
      for (const collection of migration.collections) {
        if (!await db.listCollections({ name: collection.name }).next()) {
          await db.createCollection(collection.name, {
            validator: collection.validator,
            validationLevel: 'strict',
            validationAction: 'error',
          });
        } else {
          await db.command({
            collMod: collection.name,
            validator: collection.validator,
            validationLevel: 'strict',
            validationAction: 'error',
          });
        }
        if (collection.indexes.length) {
          await db.collection(collection.name).createIndexes(collection.indexes.map((index) => ({ ...index })));
        }
        if (collection.removedIndexes?.length) {
          const indexes = await db.collection(collection.name).indexes();

          for (const name of collection.removedIndexes) {
            if (indexes.some((index) => index.name === name)) {
              await db.collection(collection.name).dropIndex(name);
            }
          }
        }

        for (const [field, from] of Object.entries(collection.fieldDefaults ?? {})) {
          await db.collection(collection.name).updateMany({ [field]: { $exists: false } },
            [{ $set: { [field]: '$' + from } }]);
        }
      }

      if (migration.transform === MigrationTransform.PageTreeV1) {
        await migratePageTree(connection);
      } else if (migration.transform === MigrationTransform.AuthorizationV1) {
        await migrateAuthorization(connection);
      } else if (migration.transform === MigrationTransform.DumpAccessV1) {
        await migrateDumpAccess(connection);
      } else if (migration.transform === MigrationTransform.AddonWorkspaceActionsV1) {
        await migrateAddonWorkspaceActions(connection);
      } else if (migration.transform === MigrationTransform.AddonRepositoryUpdateActionV1) {
        await migrateAddonRepositoryUpdateAction(connection);
      }

      for (const collection of migration.collections) {
        await verifyCollection(connection, collection);
      }
      await receipts.insertOne({ _id: migration.id, checksum: migration.checksum, appliedAt: new Date() });
    }
  }
  await verifyMigrations(connection, directory, owner);
}
