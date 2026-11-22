import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { createInterface } from 'node:readline';

import { type Connection, mongo } from 'mongoose';

import type { IHookCommitIntent } from '../../../../domain/hooks/hook-execution.js';
import { BusinessError, BusinessErrorCode } from '../../../../domain/shared/business-error.js';
import type { MongooseHookEvents } from '../../persistence/mongoose/hooks/hook-events.adapter.js';
import { readMigrations } from '../../persistence/mongoose/migrations.js';
import { requiresSiteId } from '../../persistence/mongoose/site-owned-schema.js';

export interface IDumpDatabaseMetadata {
  readonly collections: readonly string[];
  readonly schema: string;
  readonly fingerprint: string;
  readonly site: mongo.Document;
  readonly releases: readonly mongo.Document[];
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value)) : {};
}

export function encodeDocument(document: mongo.Document): string {
  return Buffer.from(mongo.BSON.serialize(document)).toString('base64');
}

export function decodeDocument(bytes: string): mongo.Document {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(bytes)) {
    throw new Error('Invalid snapshot encoding');
  }

  return mongo.BSON.deserialize(Buffer.from(bytes, 'base64'), { promoteLongs: false });
}

class SnapshotFingerprint {
  private sum = 0n;
  private count = 0;

  add(collection: string, bytes: string): void {
    const digest = createHash('sha256').update(collection + '\n' + bytes).digest('hex');

    this.sum = (this.sum + BigInt('0x' + digest)) % (1n << 256n);
    this.count++;
  }

  digest(collections: readonly string[]): string {
    return createHash('sha256')
      .update(JSON.stringify(collections) + ':' + this.count + ':' + this.sum.toString(16)).digest('hex');
  }
}

/** A technical snapshot boundary for schema-declared site-owned collections. */
function hasContentAccess(collection: string): boolean {
  return collection === 'pages' || collection === 'rendering_elements';
}

function portableContent(collection: string, document: mongo.Document): mongo.Document {
  if (!hasContentAccess(collection)) {
    return document;
  }

  const portable = { ...document };

  delete portable.createdBy;
  delete portable.accessGroupId;

  return portable;
}

export class DumpDatabase {
  constructor(private readonly connection: Connection, private readonly hooks?: MongooseHookEvents) {}

  private database(): mongo.Db {
    if (!this.connection.db) {
      throw new Error('Database unavailable');
    }

    return this.connection.db;
  }

  async schema(): Promise<{ collections: string[]; signature: string }> {
    const db = this.database();
    const schemas = [];
    const collections = [];
    const roles = new Map((await readMigrations('migrations')).flatMap((migration) =>
      migration.collections.map((collection) => [collection.name, collection.dumpRole] as const)));

    for (const collection of (await db.listCollections({}, { nameOnly: false }).toArray())
      .sort((a, b) => a.name.localeCompare(b.name))) {
      if (roles.get(collection.name) === 'Runtime' || roles.get(collection.name) === 'Global') {
        continue;
      }
      if (collection.name !== 'sites' && !requiresSiteId(collection.options?.validator)) {
        continue;
      }
      if (collection.type !== 'collection' || !/^[a-z][a-z0-9_]*$/.test(collection.name)) {
        throw new Error('Unsupported site collection');
      }
      collections.push(collection.name);
      const indexes = (await db.collection(collection.name).indexes()).map((index) =>
        Object.fromEntries(Object.entries(index).filter(([key]) => key !== 'ns')))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));

      schemas.push({ name: collection.name, validator: collection.options?.validator, indexes });
    }

    if (!collections.includes('sites')) {
      throw new Error('Site schema unavailable');
    }

    return {
      collections,
      signature: createHash('sha256')
        .update(mongo.BSON.EJSON.stringify(schemas, { relaxed: false })).digest('hex'),
    };
  }

  async capture(siteId: string, filename: string): Promise<IDumpDatabaseMetadata> {
    const schema = await this.schema();
    const session = await this.connection.startSession();
    const file = await open(filename, 'wx', 0o600);
    const hash = new SnapshotFingerprint();
    let site: mongo.Document | null = null;
    const releases: mongo.Document[] = [];

    try {
      session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });

      for (const name of schema.collections) {
        for await (const document of this.database().collection<mongo.Document & { _id: string }>(name).find(
          name === 'sites' ? { _id: siteId } : { siteId },
          { session, promoteValues: false }).sort({ _id: 1 })) {
          if (name === 'sites') {
            site = decodeDocument(encodeDocument(document));
          }
          if (name === 'publication_releases') {
            releases.push(decodeDocument(encodeDocument(document)));
          }

          const bytes = encodeDocument(portableContent(name, document));

          hash.add(name, bytes);
          await file.writeFile(JSON.stringify({ collection: name, bytes }) + '\n');
        }
      }

      if (!site) {
        throw new BusinessError(BusinessErrorCode.NotFound, 'Site not found');
      }

      return {
        collections: schema.collections,
        schema: schema.signature,
        fingerprint: hash.digest(schema.collections),
        site,
        releases,
      };
    } finally {
      await session.abortTransaction().catch(() => {});
      await session.endSession();
      await file.close();
    }
  }

  async describe(siteId: string, filename: string): Promise<IDumpDatabaseMetadata> {
    const schema = await this.schema();
    const collections = new Set(schema.collections);
    const hash = new SnapshotFingerprint();
    // Metadata reads are bounded to site/release descriptors; documents remain streamed for writes.
    let site: mongo.Document | null = null;
    const releases: mongo.Document[] = [];
    const seen = new Set<string>();

    for await (const { collection, document, bytes } of databaseRecords(filename)) {
      if (
        !collections.has(collection)
        || (collection === 'sites' ? document._id !== siteId : document.siteId !== siteId)
      ) {
        throw new Error('Foreign snapshot document');
      }

      const identity = collection + ':' + encodeDocument({ _id: document._id });

      if (seen.has(identity)) {
        throw new Error('Duplicate snapshot document');
      }
      seen.add(identity);
      hash.add(collection, bytes);

      if (collection === 'sites') {
        if (site) {
          throw new Error('Duplicate site');
        }
        site = document;
      }
      if (collection === 'publication_releases') {
        releases.push(document);
      }
    }

    if (!site) {
      throw new Error('Snapshot site missing');
    }

    return {
      collections: schema.collections,
      schema: schema.signature,
      fingerprint: hash.digest(schema.collections),
      site,
      releases,
    };
  }

  async replace(siteId: string, filename: string, before: IDumpDatabaseMetadata,
    swapFiles: () => Promise<void>, hookChange?: IHookCommitIntent): Promise<void> {
    const schema = await this.schema();

    if (schema.signature !== before.schema) {
      throw new Error('Snapshot schema changed');
    }

    const session = await this.connection.startSession();

    try {
      session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });

      if (hookChange && this.hooks) {
        await this.hooks.assertRestorationSafe(siteId, session);
      }

      const previousAccess = new Map<string, { createdBy?: string | null; accessGroupId?: string | null }>();
      // Read business data for stale detection and retain installation-local authorization for existing objects.
      const hash = new SnapshotFingerprint();

      for (const collection of schema.collections) {
        const filter = collection === 'sites' ? { _id: siteId } : { siteId };
        const records = this.database().collection<mongo.Document & { _id: string }>(collection);

        for await (const document of records.find(filter,
          { session, promoteValues: false }).sort({ _id: 1 })) {
          hash.add(collection, encodeDocument(portableContent(collection, document)));

          if (hasContentAccess(collection)) {
            const { createdBy, accessGroupId } = document;

            if (typeof createdBy === 'string' || typeof accessGroupId === 'string') {
              previousAccess.set(collection + ':' + document._id, {
                createdBy: typeof createdBy === 'string' ? createdBy : null,
                accessGroupId: typeof accessGroupId === 'string' ? accessGroupId : null,
              });
            }
          }
        }
        await this.database().collection<mongo.Document & { _id: string }>(collection).deleteMany(filter, { session });
      }

      if (hash.digest(schema.collections) !== before.fingerprint) {
        throw new BusinessError(BusinessErrorCode.StaleWrite, 'Site changed before restoration');
      }

      for await (const { collection, document, bytes } of databaseRecords(filename)) {
        if (
          !schema.collections.includes(collection)
          || (collection === 'sites' ? document._id !== siteId
            : document.siteId !== siteId)
        ) {
          throw new Error('Foreign snapshot document');
        }

        const record = portableContent(collection, mongo.BSON.deserialize(Buffer.from(bytes, 'base64'),
          { promoteValues: false }));
        const attributes = hasContentAccess(collection) && typeof document._id === 'string'
          ? previousAccess.get(collection + ':' + document._id) : undefined;

        await this.database().collection(collection).insertOne({ ...record, ...attributes }, { session });
      }
      await swapFiles();

      if (hookChange?.facts.length) {
        if (!this.hooks) {
          throw new Error('Restore hook persistence is required');
        }
        if (hookChange.facts.some((fact) => fact.hookKey === 'cms.site.restored')) {
          await this.hooks.recordRestoration(hookChange, session);
        } else {
          await this.hooks.record(hookChange, session);
        }
      }
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction().catch(() => {});
      throw error;
    } finally {
      await session.endSession();
    }
  }
}

export async function* databaseRecords(filename: string): AsyncGenerator<{
  collection: string; bytes: string; document: mongo.Document;
}> {
  const stream = createReadStream(filename);
  const lines = createInterface({ input: stream, crlfDelay: Infinity });

  try {
    for await (const line of lines) {
      const row = object(JSON.parse(line));

      if (typeof row.collection !== 'string' || typeof row.bytes !== 'string') {
        throw new Error('Invalid snapshot row');
      }
      yield { collection: row.collection, bytes: row.bytes, document: decodeDocument(row.bytes) };
    }
  } finally {
    lines.close();
    stream.destroy();
  }
}
