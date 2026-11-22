import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  cp, lstat, mkdir, mkdtemp, open, readdir, readFile, rename, rm, writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';

import { type Connection, type mongo } from 'mongoose';

import { hasAdministratorGrant } from '../../../../domain/authorization/admin-authorization.js';
import { BuiltInRoleId } from '../../../../domain/authorization/built-in-roles.js';
import { type ISiteDump, requireDumpFilename, SiteDumpType } from '../../../../domain/dumps/site-dump.js';
import type { IBinaryContent } from '../../../../domain/shared/binary-content.js';
import { BusinessError, BusinessErrorCode } from '../../../../domain/shared/business-error.js';
import { readAdminAuthority } from '../../persistence/mongoose/authorization/admin-authority.adapter.js';
import { decodeDocument, encodeDocument } from '../mongoose/dump-database.adapter.js';
import { maximumDumpBytes, readDumpRecords, writeDumpRecords } from './dump-archive.js';
import { checked, child, type IDirectorySwap, missing, rollbackSwaps, treeRecords } from './dump-files.js';
import type { IDumpStorageSettings } from './site-dump-store.adapter.js';

export const installationArchiveDirectory = '.installation-archives';

const restoreJournal = '.coordination/installation-restore.json';

const markerCollection = 'installation_restore_commits';

const sessionCollection = 'admin_auth_sessions';

const archiveFormat = 'zarya-installation';

const temporaryArea = '.installation-restore-';

const identifier = /^[a-f0-9-]{36}$/;

class UncertainInstallationCommit extends Error {}

type Database = NonNullable<Connection['db']>;

type ArchiveRow = Readonly<Record<string, unknown>>;

interface IArchiveSchema {
  readonly names: readonly string[];
  readonly signature: string;
}

interface IJournalEntry {
  readonly area: string;
  readonly name: string;
  readonly hadOriginal: boolean;
  readonly hasNext: boolean;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected an archive object');
  }

  return Object.fromEntries(Object.entries(value));
}

function isReceipt(name: string): boolean {
  return name === 'schema_migrations' || /^addon_[a-z0-9_]+_migrations$/.test(name);
}

async function archiveSchema(db: Database): Promise<IArchiveSchema> {
  const names: string[] = [];
  const hash = createHash('sha256');
  const collections = await db.listCollections({}, { nameOnly: false }).toArray();

  collections.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of collections) {
    if (entry.name.startsWith('system.')) {
      continue;
    }
    if (entry.type !== 'collection' || !/^[a-z][a-z0-9_]*$/.test(entry.name)) {
      throw new Error('Unsupported installation collection');
    }

    const collection = db.collection(entry.name);
    const indexes = (await collection.indexes()).sort((a, b) => String(a.name).localeCompare(String(b.name)));

    hash.update(JSON.stringify([entry.name, entry.options?.validator, indexes]));

    if (isReceipt(entry.name)) {
      for await (const receipt of collection.find().sort({ _id: 1 })) {
        hash.update(JSON.stringify([receipt._id, receipt.checksum]));
      }
    } else if (entry.name !== markerCollection && entry.name !== sessionCollection) {
      names.push(entry.name);
    }
  }

  return { names, signature: hash.digest('hex') };
}

async function fingerprint(root: string): Promise<string> {
  const hash = createHash('sha256');

  for await (const record of treeRecords(root, 'packages')) {
    hash.update(JSON.stringify(record) + '\n');
  }

  return hash.digest('hex');
}

interface IOpenFile {
  readonly file: Awaited<ReturnType<typeof open>>;
  readonly size: number;
  readonly hash: ReturnType<typeof createHash>;
  written: number;
}

class InstallationFiles {
  private current: IOpenFile | null = null;
  private readonly paths = new Set<string>();

  constructor(private readonly directory: string, private readonly areas: ReadonlySet<string>) {}

  async stage(row: ArchiveRow): Promise<void> {
    if (this.current) {
      await this.write(row, this.current);

      return;
    }
    if (
      (row.kind !== 'directory'
      && row.kind !== 'file')
      || typeof row.area !== 'string'
      || !this.areas.has(row.area)
      || typeof row.path !== 'string'
      || row.path.split('/')[0]?.startsWith(temporaryArea)
    ) {
      throw new Error('Invalid archive file record');
    }

    const key = row.area + '/' + row.path.toLowerCase();

    if (this.paths.has(key)) {
      throw new Error('Duplicate archive path');
    }
    this.paths.add(key);
    const destination = child(path.join(this.directory, row.area), row.path);

    if (row.kind === 'directory') {
      await mkdir(destination, { recursive: true });
    } else {
      if (typeof row.size !== 'number' || !Number.isSafeInteger(row.size) || row.size < 0) {
        throw new Error('Invalid archive file length');
      }
      await mkdir(path.dirname(destination), { recursive: true });
      this.current = {
        file: await open(destination, 'wx', 0o600), size: row.size, hash: createHash('sha256'), written: 0,
      };
    }
  }

  private async write(row: ArchiveRow, file: IOpenFile): Promise<void> {
    if (row.kind === 'fileEnd' && file.written === file.size && row.checksum === file.hash.digest('hex')) {
      await file.file.close();
      this.current = null;

      return;
    }
    if (row.kind !== 'chunk' || typeof row.data !== 'string' || row.data.length > 87384) {
      throw new Error('Invalid archive file chunk');
    }

    const bytes = Buffer.from(row.data, 'base64');

    if (
      !bytes.length
      || bytes.length > 65536
      || bytes.toString('base64') !== row.data
      || file.written + bytes.length > file.size
    ) {
      throw new Error('Invalid archive file payload');
    }
    file.written += bytes.length;
    file.hash.update(bytes);
    await file.file.writeFile(bytes);
  }

  complete(): void {
    if (this.current) {
      throw new Error('An archive file is incomplete');
    }
  }

  async close(): Promise<void> {
    await this.current?.file.close();
  }
}

export class InstallationDumpStore {
  private readonly roots: Readonly<Record<string, string>>;
  private readonly packageRoot: string;

  constructor(private readonly settings: IDumpStorageSettings, private readonly connection: Connection,
    ownerRoot = settings.root) {
    this.roots = {
      sources: path.resolve(settings.sourcesRoot),
      artifacts: path.resolve(settings.artifactsRoot),
      ...(settings.mediaRoot ? { media: path.resolve(settings.mediaRoot) } : {}),
    };
    this.packageRoot = path.resolve(ownerRoot, '.installed-addons');
  }

  private db(): Database {
    if (!this.connection.db) {
      throw new Error('MongoDB connection is not open');
    }

    return this.connection.db;
  }

  private assertSeparateRoots(): void {
    const paths = [...Object.values(this.roots), path.resolve(this.settings.root), this.packageRoot];
    const dataRoots = Object.values(this.roots);

    if (
      dataRoots.some((root) => paths.filter((candidate) => candidate === root
      || candidate.startsWith(root + path.sep) || root.startsWith(candidate + path.sep)).length !== 1)
    ) {
      throw new BusinessError(BusinessErrorCode.Validation, 'Installation storage roots must be separate');
    }
  }

  async create(): Promise<ISiteDump> {
    this.assertSeparateRoots();
    const directory = await checked(this.settings.root, installationArchiveDirectory);
    const createdAt = new Date();
    const filename = createdAt.toISOString().replace(/[:.]/g, '-') + '_' + randomUUID() + '.jsonl.gz';
    const pending = child(directory, filename + '.tmp');
    const sizeLimit = maximumDumpBytes;

    await mkdir(directory, { recursive: true, mode: 0o700 });

    try {
      await writeDumpRecords(pending, this.records(createdAt));
      const { size } = await lstat(pending);

      if (size > sizeLimit) {
        throw new BusinessError(BusinessErrorCode.Validation, 'Installation archive exceeds its limit');
      }
      await rename(pending, child(directory, filename));

      return { type: SiteDumpType.Installation, filename, byteSize: size, createdAt };
    } finally {
      await rm(pending, { force: true });
    }
  }

  private async *records(createdAt: Date): AsyncGenerator<Record<string, unknown>> {
    const db = this.db();
    const schema = await archiveSchema(db);
    const packages = await fingerprint(this.packageRoot);
    const session = await this.connection.startSession({ snapshot: true });

    try {
      yield {
        kind: 'header',
        format: archiveFormat,
        version: 1,
        createdAt: createdAt.toISOString(),
        schema: schema.signature,
        collections: schema.names,
        areas: Object.keys(this.roots),
        packages,
      };

      for (const collection of schema.names) {
        for await (const doc of db.collection(collection).find({}, { session, promoteValues: false })) {
          yield { kind: 'document', collection, bytes: encodeDocument(doc) };
        }
      }
    } finally {
      await session.endSession();
    }

    for (const [area, root] of Object.entries(this.roots)) {
      yield* treeRecords(root, area);
    }
  }

  async open(filename: string): Promise<IBinaryContent> {
    requireDumpFilename(filename);
    const target = await checked(this.settings.root, installationArchiveDirectory + '/' + filename);
    const info = await lstat(target).catch((error: unknown) => {
      if (missing(error)) {
        throw new BusinessError(BusinessErrorCode.NotFound, 'Installation archive not found');
      }
      throw error;
    });

    if (!info.isFile() || info.isSymbolicLink()) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Installation archive not found');
    }

    return { byteSize: info.size, mimeType: 'application/gzip', bytes: createReadStream(target) };
  }

  async restore(content: IBinaryContent, failClosed: () => void): Promise<void> {
    this.assertSeparateRoots();
    const operationId = randomUUID();
    const work = await mkdtemp(child(this.settings.root, '.installation-upload-'));
    let entries: readonly IJournalEntry[] = [];
    let journaled = false;
    const journal = await checked(this.settings.root, restoreJournal);

    try {
      const upload = child(work, 'upload.gz');
      const documents = child(work, 'documents.jsonl');
      const schema = await archiveSchema(this.db());

      await this.upload(content, upload);
      await this.stage(upload, work, documents, schema);
      const nextJournal = child(work, 'restore-journal.json');
      const privateWrite = { flag: 'wx', mode: 0o600, flush: true };

      await writeFile(journal, JSON.stringify({ operationId, entries }), privateWrite);
      journaled = true;
      entries = await this.prepareSwaps(work, operationId);
      await writeFile(nextJournal, JSON.stringify({ operationId, entries }), privateWrite);
      await rename(nextJournal, journal);
      await this.replace(documents, schema, operationId, entries);
      await this.finish(operationId, entries, true);
    } catch (error) {
      if (error instanceof UncertainInstallationCommit) {
        failClosed();
        throw error;
      }
      if (journaled) {
        try {
          await this.recover();
        } catch (recoveryError) {
          failClosed();
          throw new AggregateError([error, recoveryError], 'Installation restore requires recovery');
        }
      } else {
        await this.clearStages(operationId);
      }
      throw error;
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }

  private async upload(content: IBinaryContent, filename: string): Promise<void> {
    if (!Number.isSafeInteger(content.byteSize) || content.byteSize < 1 || content.byteSize > maximumDumpBytes) {
      throw new BusinessError(BusinessErrorCode.Validation, 'Invalid installation archive length');
    }

    const file = await open(filename, 'wx', 0o600);
    let size = 0;

    try {
      for await (const bytes of content.bytes) {
        size += bytes.byteLength;

        if (size > content.byteSize) {
          throw new BusinessError(BusinessErrorCode.Validation, 'Installation archive exceeds its declared length');
        }
        await file.writeFile(bytes);
      }

      if (size !== content.byteSize) {
        throw new BusinessError(BusinessErrorCode.Validation, 'Incomplete installation archive upload');
      }
    } finally {
      await file.close();
    }
  }

  private async stage(upload: string, work: string, documents: string, schema: IArchiveSchema): Promise<void> {
    const areas = Object.keys(this.roots);
    const files = new InstallationFiles(work, new Set(areas));
    const packages = await fingerprint(this.packageRoot);
    const names = new Set(schema.names);
    const output = await open(documents, 'wx', 0o600);
    let header = false;
    let hasFiles = false;

    try {
      for (const area of areas) {
        await mkdir(child(work, area));
      }

      for await (const row of readDumpRecords(upload)) {
        if (!header) {
          if (
            row.kind !== 'header'
            || row.format !== archiveFormat
            || row.version !== 1
            || row.schema !== schema.signature
            || row.packages !== packages
            || JSON.stringify(row.collections) !== JSON.stringify(schema.names)
            || JSON.stringify(row.areas) !== JSON.stringify(areas)
          ) {
            throw new Error('Incompatible installation archive');
          }
          header = true;
        } else if (
          row.kind === 'document'
          && !hasFiles
          && typeof row.collection === 'string'
          && names.has(row.collection)
          && typeof row.bytes === 'string'
        ) {
          const document = decodeDocument(row.bytes);

          if (!Object.hasOwn(document, '_id')) {
            throw new Error('Archive document has no identity');
          }
          await output.writeFile(JSON.stringify({ collection: row.collection, bytes: row.bytes }) + '\n');
        } else {
          hasFiles = true;
          await files.stage(row);
        }
      }

      if (!header) {
        throw new Error('Missing installation archive header');
      }
      files.complete();
    } catch {
      throw new BusinessError(BusinessErrorCode.Validation, 'Invalid or incompatible installation archive');
    } finally {
      await files.close();
      await output.close();
    }
  }

  private async prepareSwaps(work: string, id: string): Promise<IJournalEntry[]> {
    const entries: IJournalEntry[] = [];

    for (const [area, root] of Object.entries(this.roots)) {
      await mkdir(root, { recursive: true, mode: 0o700 });
      const stage = await checked(root, temporaryArea + id);
      const current = new Set(await readdir(root));
      const incoming = new Set(await readdir(child(work, area)));

      await mkdir(stage, { mode: 0o700 });
      await mkdir(path.join(stage, 'next'));
      await mkdir(path.join(stage, 'before'));

      for (const name of new Set([...current, ...incoming])) {
        if (name.startsWith(temporaryArea)) {
          throw new Error('Installation archive staging already exists');
        }
        await checked(root, name);

        if (incoming.has(name)) {
          await cp(child(work, area + '/' + name), child(stage, 'next/' + name), { recursive: true });
        }
        entries.push({ area, name, hadOriginal: current.has(name), hasNext: incoming.has(name) });
      }
    }

    return entries;
  }

  private swaps(id: string, entries: readonly IJournalEntry[]): IDirectorySwap[] {
    return entries.map(({ area, name, hadOriginal }) => {
      const root = this.roots[area];

      if (!root || name.includes('/') || name.startsWith(temporaryArea)) {
        throw new Error('Invalid installation restore journal paths');
      }

      return {
        root,
        target: name,
        hadOriginal,
        previous: temporaryArea + id + '/before/' + name,
        staged: temporaryArea + id + '/next/' + name,
      };
    });
  }

  private async replace(documents: string, schema: IArchiveSchema, id: string,
    entries: readonly IJournalEntry[]): Promise<void> {
    const db = this.db();
    const session = await this.connection.startSession();

    try {
      session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });

      for (const collection of [...schema.names, sessionCollection]) {
        await db.collection(collection).deleteMany({}, { session });
      }

      let name = '';
      let pending: mongo.Document[] = [];
      const flush = async (): Promise<void> => {
        if (pending.length) {
          await db.collection(name).insertMany(pending, { session });
          pending = [];
        }
      };
      const lines = createInterface({ input: createReadStream(documents), crlfDelay: Infinity });

      for await (const line of lines) {
        const row = object(JSON.parse(line));
        const { collection, bytes } = row;

        if (typeof collection !== 'string' || !schema.names.includes(collection) || typeof bytes !== 'string') {
          throw new Error('Invalid staged document');
        }
        if (collection !== name || pending.length >= 64) {
          await flush();
          name = collection;
        }
        pending.push(decodeDocument(bytes));
      }
      await flush();

      const [administrator] = await db.collection('role_assignments').aggregate([
        { $match: { roleId: BuiltInRoleId.SystemAdmin, scope: 'installation', siteId: null } },
        { $lookup: { from: 'admin_users', localField: 'actorId', foreignField: '_id', as: 'actor' } },
        { $match: { actor: { $elemMatch: { blocked: false, deletedAt: null } } } },
        { $limit: 1 },
      ], { session }).toArray();
      const authority = typeof administrator?.actorId === 'string'
        ? await readAdminAuthority(db, administrator.actorId, session) : undefined;

      if (!authority || !hasAdministratorGrant(authority, 'cms.installation-dumps.restore')) {
        throw new BusinessError(BusinessErrorCode.Validation, 'Archive requires an active System Admin');
      }
      await db.collection<{ _id: string }>(markerCollection).updateOne({ _id: 'latest' },
        { $set: { operationId: id } }, { upsert: true, session });
      const swaps = this.swaps(id, entries);

      for (const [index, swap] of swaps.entries()) {
        if (swap.hadOriginal) {
          await rename(await checked(swap.root, swap.target), await checked(swap.root, swap.previous));
        }
        if (entries[index]?.hasNext) {
          await rename(await checked(swap.root, swap.staged), await checked(swap.root, swap.target));
        }
      }

      try {
        await session.commitTransaction();
      } catch (error) {
        if (
          error
          && typeof error === 'object'
          && 'hasErrorLabel' in error
          && typeof error.hasErrorLabel === 'function'
          && error.hasErrorLabel('UnknownTransactionCommitResult')
        ) {
          throw new UncertainInstallationCommit('Installation restore requires recovery', { cause: error });
        }
        throw error;
      }
    } finally {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
      await session.endSession();
    }
  }

  async recover(): Promise<void> {
    const filename = await checked(this.settings.root, restoreJournal);
    const content = await readFile(filename, 'utf8').catch((error: unknown) => {
      if (missing(error)) {
        return null;
      }
      throw error;
    });

    if (content === null) {
      return;
    }

    const journal = object(JSON.parse(content));
    const { operationId } = journal;

    if (typeof operationId !== 'string' || !identifier.test(operationId) || !Array.isArray(journal.entries)) {
      throw new Error('Invalid installation restore journal');
    }

    const entries = journal.entries.map((value: unknown): IJournalEntry => {
      const { area, name, hadOriginal, hasNext } = object(value);

      if (
        typeof area !== 'string'
        || typeof name !== 'string'
        || typeof hadOriginal !== 'boolean'
        || typeof hasNext !== 'boolean'
      ) {
        throw new Error('Invalid installation restore journal entry');
      }

      return { area, name, hadOriginal, hasNext };
    });
    const committed = await this.db().collection<{ _id: string }>(markerCollection)
      .findOne({ _id: 'latest', operationId }, { readConcern: { level: 'majority' } });

    await this.finish(operationId, entries, committed !== null);
  }

  private async finish(id: string, entries: readonly IJournalEntry[], committed: boolean): Promise<void> {
    if (!committed) {
      await rollbackSwaps(this.swaps(id, entries));
    }
    await this.clearStages(id);
    await rm(await checked(this.settings.root, restoreJournal), { force: true });
  }

  private async clearStages(id: string): Promise<void> {
    for (const root of Object.values(this.roots)) {
      await rm(await checked(root, temporaryArea + id), { recursive: true, force: true });
    }
  }
}
