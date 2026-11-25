import { createHash, randomUUID } from 'node:crypto';
import { cp, lstat, mkdir, mkdtemp, open, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import {
  type ISiteDump, type ISiteDumpApplication, type ISiteDumpCreation, type ISiteDumpReview,
  requireDumpFilename, siteDumpFilename,
  SiteDumpType,
} from '../../../../domain/dumps/site-dump.js';
import type { IBinaryContent } from '../../../../domain/shared/binary-content.js';
import { BusinessError, BusinessErrorCode } from '../../../../domain/shared/business-error.js';
import { normalizeSiteHostname } from '../../../../domain/sites/site-hostname.policy.js';
import type { ISiteDumpStore } from '../../../../ports/outbound/dumps/site-dump-store.port.js';
import { FileDeliveryRestoreGuard } from '../../deployment/files/delivery-restore-guard.adapter.js';
import { PublicationDirectoryAdapter } from '../../publication/files/publication-directory.adapter.js';
import { FileRenderingSourceAdapter } from '../../rendering/files/rendering-source.adapter.js';
import { databaseRecords, type DumpDatabase, type IDumpDatabaseMetadata } from '../mongoose/dump-database.adapter.js';
import { maximumDumpBytes, readDumpRecords, writeDumpRecords } from './dump-archive.js';
import { recoverCaptureJobs } from './dump-capture-lease.js';
import { reconcileDumpElements, validateDumpConfigs } from './dump-elements.js';
import {
  applySwaps, checked, child, fileHash, type IDirectorySwap, missing, rollbackSwaps, treeRecords,
} from './dump-files.js';
import { dumpHeaderType, readDumpHeader } from './dump-format.js';
import { DumpMaintenance } from './dump-maintenance.js';
import { DumpFileArea, type IDumpLayout, type IPreparedDump } from './dump-prepared.js';
import {
  FilePartialDumpAdapter, type IPartialAddonExport, type IPartialAddonTransfer,
} from './partial-dump.adapter.js';

export interface IDumpStorageSettings {
  readonly root: string;
  readonly sourcesRoot: string;
  readonly artifactsRoot: string;
  readonly mediaRoot?: string;
}

interface IRestoreJournal {
  readonly siteId: string;
  readonly before: string;
  readonly artifactDomain?: string;
  readonly after: string;
  readonly swaps: readonly IDirectorySwap[];
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid dump object');
  }

  return Object.fromEntries(Object.entries(value));
}

function readLayout(input: unknown): IDumpLayout {
  const value = record(input);

  if (
    value.sourceKey !== null
    && (typeof value.sourceKey !== 'string'
    || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(value.sourceKey))
    || value.mediaDomain !== null
    && (typeof value.mediaDomain !== 'string'
      || !/^[a-z0-9][a-z0-9.-]*$/.test(value.mediaDomain)
    || value.mediaDomain.includes('..'))
    || !Array.isArray(value.artifactDirectories)
  ) {
    throw new Error('Invalid dump layout');
  }

  const directories: unknown[] = value.artifactDirectories;

  return {
    sourceKey: value.sourceKey,
    mediaDomain: value.mediaDomain,
    artifactDirectories: directories.map((value) => {
      if (typeof value !== 'string') {
        throw new Error('Invalid artifact directory');
      }

      return value;
    }),
  };
}

function readJournal(input: unknown): IRestoreJournal {
  const value = record(input);

  if (
    typeof value.siteId !== 'string'
    || !/^[A-Za-z0-9_-]{1,128}$/.test(value.siteId)
    || typeof value.before !== 'string'
    || !/^[a-f0-9]{64}$/.test(value.before)
    || typeof value.after !== 'string'
    || !/^[a-f0-9]{64}$/.test(value.after)
    || !Array.isArray(value.swaps)
  ) {
    throw new Error('Invalid restore journal');
  }

  const swaps: unknown[] = value.swaps;

  return {
    siteId: value.siteId,
    ...(typeof value.artifactDomain === 'string' ? {
      artifactDomain: normalizeSiteHostname(value.artifactDomain),
    } : {}),
    before: value.before,
    after: value.after,
    swaps: swaps.map((input) => {
      const swap = record(input);

      if (
        typeof swap.root !== 'string'
        || typeof swap.target !== 'string'
        || typeof swap.staged !== 'string'
        || typeof swap.previous !== 'string'
        || typeof swap.hadOriginal !== 'boolean'
        || !/^\.restore-[a-f0-9-]{36}-new$/.test(path.posix.basename(swap.staged))
        || swap.previous !== swap.staged.slice(0, -4) + '-old'
        || path.posix.dirname(swap.target) !== path.posix.dirname(swap.staged)
      ) {
        throw new Error('Invalid restore swap');
      }

      return {
        root: swap.root,
        target: swap.target,
        staged: swap.staged,
        previous: swap.previous,
        hadOriginal: swap.hadOriginal,
      };
    }),
  };
}

function metadata(filename: string, size: number, type = SiteDumpType.Site): ISiteDump {
  const stamp = filename.slice(0, 24);

  return {
    type,
    filename,
    byteSize: size,
    createdAt: new Date(stamp.slice(0, 13) + ':' + stamp.slice(14, 16)
    + ':' + stamp.slice(17, 19) + '.' + stamp.slice(20, 24)),
  };
}

function archiveName(createdAt = new Date()): string {
  return createdAt.toISOString().replace(/[:.]/g, '-') + '_' + randomUUID() + '.jsonl.gz';
}

function artifactDirectories(metadata: IDumpDatabaseMetadata, domainBased = false): string[] {
  return metadata.releases.filter((release) => release.state === 'Ready').map((release) => {
    if (typeof release._id !== 'string' || release.siteKey !== undefined && typeof release.siteKey !== 'string') {
      throw new Error('Invalid release identity');
    }

    return 'sites/' + encodeURIComponent(domainBased ? normalizeSiteHostname(String(metadata.site.primaryDomain))
      : String(release.siteKey ?? metadata.site._id))
      + '/' + encodeURIComponent(release._id);
  }).sort();
}

export class FileSiteDumpStore implements ISiteDumpStore {
  readonly maintenance: DumpMaintenance;

  constructor(private readonly settings: IDumpStorageSettings, private readonly database: DumpDatabase,
    maintenance = new DumpMaintenance(), private readonly addonTransfer?: IPartialAddonTransfer,
    private readonly addonExport?: IPartialAddonExport) {
    this.maintenance = maintenance;
  }

  private async artifactDirectories(metadata: IDumpDatabaseMetadata): Promise<string[]> {
    const directories = new PublicationDirectoryAdapter(this.settings.artifactsRoot, {
      primaryDomain: async (siteId) => {
        if (siteId !== metadata.site._id) {
          throw new Error('Foreign publication owner');
        }

        return String(metadata.site.primaryDomain);
      },
    });

    if (typeof metadata.site._id !== 'string') {
      throw new Error('Invalid site identity');
    }
    await directories.synchronize(metadata.site._id);

    return Promise.all(metadata.releases.filter((release) => release.state === 'Ready').map(async (release) => {
      if (
        typeof release._id !== 'string'
        || typeof metadata.site._id !== 'string'
        || release.siteKey !== undefined
        && typeof release.siteKey !== 'string'
      ) {
        throw new Error('Invalid release');
      }

      const directory = await directories.resolve({
        siteId: metadata.site._id,
        releaseId: release._id,
        ...(release.siteKey === undefined ? {} : { siteKey: release.siteKey }),
      });

      return path.relative(path.resolve(this.settings.artifactsRoot), directory).split(path.sep).join('/');
    })).then((directories) => directories.sort());
  }

  private async directory(siteId: string): Promise<string> {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(siteId)) {
      throw new Error('Invalid site identity');
    }

    const directory = await checked(this.settings.root, siteId);

    await mkdir(directory, { recursive: true, mode: 0o700 });

    return directory;
  }

  async list(siteId: string): Promise<readonly ISiteDump[]> {
    const directory = await this.directory(siteId);
    const result: ISiteDump[] = [];

    for (const filename of await readdir(directory)) {
      if (!siteDumpFilename.test(filename)) {
        continue;
      }

      const info = await lstat(child(directory, filename)).catch((error: unknown) => {
        if (!missing(error)) {
          throw error;
        }

        return null;
      });

      if (info?.isFile() && !info.isSymbolicLink()) {
        const type = await readDumpHeader(child(directory, filename)).then(dumpHeaderType)
          .catch((error: unknown) => {
            if (missing(error)) {
              return null;
            }

            return SiteDumpType.Unknown;
          });

        if (type === null) {
          continue;
        }

        const dump = metadata(filename, info.size, type);

        if (Number.isFinite(dump.createdAt.getTime())) {
          result.push(dump);
        }
      }
    }

    return result.sort((a, b) => b.filename.localeCompare(a.filename));
  }

  async open(siteId: string, filename: string): Promise<ISiteDump & { readonly content: IBinaryContent }> {
    requireDumpFilename(filename);
    const directory = await this.directory(siteId);
    const target = await checked(directory, filename);
    const handle = await open(target, 'r').catch((error: unknown) => {
      if (missing(error)) {
        throw new BusinessError(BusinessErrorCode.NotFound, 'Dump not found');
      }
      throw error;
    });
    const info = await handle.stat();

    if (!info.isFile()) {
      await handle.close();
      throw new Error('Dump is not a regular file');
    }

    return {
      ...metadata(filename, info.size, await readDumpHeader(target).then(dumpHeaderType)
        .catch(() => SiteDumpType.Unknown)),
      content: {
        byteSize: info.size, mimeType: 'application/gzip', bytes: handle.createReadStream(),
      },
    };
  }

  runInstallationOperation(action: () => Promise<void>): Promise<void> {
    return this.exclusive(action);
  }

  protected async exclusive<T>(action: () => Promise<T>, allowReads = false): Promise<T> {
    return this.maintenance.run(async () => {
      await mkdir(this.settings.root, { recursive: true, mode: 0o700 });
      const lockPath = child(this.settings.root, '.coordination/.operation.lock');

      await mkdir(path.dirname(lockPath), { recursive: true, mode: 0o700 });
      let lock;

      try {
        lock = await open(lockPath, 'wx', 0o600);
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
          throw new BusinessError(BusinessErrorCode.Conflict, 'Another dump operation is active');
        }
        throw error;
      }

      try {
        await lock.writeFile(String(process.pid));
        await new FileDeliveryRestoreGuard(this.settings.root).assertRestorable();

        return await action();
      } finally {
        await lock.close();
        await rm(lockPath, { force: true });
      }
    }, allowReads);
  }

  private partials(): FilePartialDumpAdapter {
    return new FilePartialDumpAdapter(this.settings, this.database, this.addonTransfer, this.addonExport);
  }

  async exportItems(siteId: string, type: SiteDumpType): Promise<ISiteDumpReview> {
    return this.partials().exportItems(siteId, type, await this.directory(siteId));
  }

  async inspect(siteId: string, filename: string): Promise<ISiteDumpReview> {
    requireDumpFilename(filename);
    const directory = await this.directory(siteId);
    const target = await checked(directory, filename);
    const type = dumpHeaderType(await readDumpHeader(target));

    if (type === SiteDumpType.Site) {
      const prepared = await this.prepare(siteId, target, directory);

      await rm(prepared.directory, { recursive: true, force: true });

      return { type, items: [], version: '', pages: [], targetPages: [] };
    }

    return this.partials().inspect(siteId, target, directory);
  }

  async create(siteId: string, options?: ISiteDumpCreation): Promise<ISiteDump> {
    if (options && options.type !== SiteDumpType.Site) {
      return this.exclusive(async () => {
        const directory = await this.directory(siteId);
        const work = await mkdtemp(child(directory, '.export-'));
        const filename = archiveName();
        const temporary = child(directory, filename + '.tmp');

        try {
          const missingFileReferences = await this.partials().create(siteId, options, temporary, work);
          const info = await lstat(temporary);

          if (info.size > maximumDumpBytes) {
            throw new Error('Dump exceeds its limit');
          }
          await rename(temporary, child(directory, filename));

          return {
            ...metadata(filename, info.size, options.type),
            ...(missingFileReferences ? { missingFileReferences } : {}),
          };
        } finally {
          await rm(work, { recursive: true, force: true });
          await rm(temporary, { force: true });
        }
      });
    }

    return this.exclusive(() => this.createOwned(siteId));
  }

  async delete(siteId: string, filename: string): Promise<void> {
    requireDumpFilename(filename);
    await this.exclusive(async () => {
      const directory = await this.directory(siteId);
      const target = await checked(directory, filename);
      const info = await lstat(target).catch((error: unknown) => {
        if (!missing(error)) {
          throw error;
        }

        return null;
      });

      if (info && !info.isFile()) {
        throw new Error('Dump is not a regular file');
      }
      await rm(target, { force: true });
    });
  }

  private async createOwned(siteId: string): Promise<ISiteDump> {
    const directory = await this.directory(siteId);
    const work = await mkdtemp(child(directory, '.capture-'));
    const filename = archiveName();
    const temporary = child(directory, filename + '.tmp');

    try {
      const documents = path.join(work, 'documents.jsonl');
      const original = await this.database.capture(siteId, documents);
      const source = await new FileRenderingSourceAdapter(this.settings.sourcesRoot).locate(siteId);
      const sources = path.join(work, 'sources');

      await mkdir(sources);

      if (source) {
        const from = await checked(this.settings.sourcesRoot, source.key);

        // Traverse first to reject links, special files and escaping paths before copying.
        for await (const entry of treeRecords(from, 'sources')) {
          if (!entry.kind) {
            throw new Error('Invalid source record');
          }
        }
        await cp(from, child(sources, source.key), { recursive: true, dereference: false });
      }
      await validateDumpConfigs(sources);
      await reconcileDumpElements(sources, siteId, documents);
      const match = await new FileRenderingSourceAdapter(sources).locate(siteId);
      const schema = await this.database.schema();

      if (schema.signature !== original.schema) {
        throw new Error('Snapshot schema changed');
      }

      const layout: IDumpLayout = {
        sourceKey: match?.key ?? null,
        mediaDomain: this.settings.mediaRoot ? String(original.site.primaryDomain) : null,
        artifactDirectories: await this.artifactDirectories(original),
      };
      const settings = this.settings;
      const records = async function* (): AsyncGenerator<Record<string, unknown>> {
        yield {
          kind: 'header',
          type: SiteDumpType.Site,
          format: 'zarya-site',
          version: 1,
          siteId,
          createdAt: metadata(filename, 0).createdAt,
          schema: schema.signature,
          collections: schema.collections,
          layout,
        };

        for await (const row of databaseRecords(documents)) {
          yield { kind: 'document', collection: row.collection, bytes: row.bytes };
        }

        if (layout.sourceKey) {
          yield* treeRecords(child(sources, layout.sourceKey), 'sources');
        }
        if (layout.mediaDomain && settings.mediaRoot) {
          const media = await checked(settings.mediaRoot, layout.mediaDomain);
          const info = await lstat(media).catch((error: unknown) => {
            if (!missing(error)) {
              throw error;
            }

            return null;
          });

          if (info) {
            const marker: unknown = JSON.parse(await readFile(child(media, '.site.json'), 'utf8'));

            if (!marker || typeof marker !== 'object' || !('siteId' in marker) || marker.siteId !== siteId) {
              throw new Error('Media directory ownership mismatch');
            }
            yield* treeRecords(media, 'media');
          }
        }

        for (const relative of layout.artifactDirectories) {
          const root = await checked(settings.artifactsRoot, relative);

          if (!(await lstat(root)).isDirectory()) {
            throw new Error('Missing published release files');
          }

          for await (const record of treeRecords(root, 'artifacts')) {
            yield { ...record, ...(typeof record.path === 'string' ? { path: relative + '/' + record.path } : {}) };
          }
        }
      };

      await writeDumpRecords(temporary, records());

      if ((await lstat(temporary)).size > maximumDumpBytes) {
        throw new Error('Dump exceeds its limit');
      }

      // Validate the complete result before making it downloadable.
      const prepared = await this.prepare(siteId, temporary, directory);

      await rm(prepared.directory, { recursive: true, force: true });
      await rename(temporary, child(directory, filename));

      return metadata(filename, (await lstat(child(directory, filename))).size);
    } finally {
      await rm(work, { recursive: true, force: true });
      await rm(temporary, { force: true });
    }
  }

  async import(siteId: string, content: IBinaryContent, requiredType?: SiteDumpType.Site): Promise<ISiteDump> {
    return this.exclusive(async () => {
      if (content.byteSize > maximumDumpBytes) {
        throw new BusinessError(BusinessErrorCode.Validation, 'Dump too large');
      }

      const directory = await this.directory(siteId);
      const filename = archiveName();
      const temporary = child(directory, filename + '.tmp');
      const file = await open(temporary, 'wx', 0o600);
      let size = 0;

      try {
        for await (const bytes of content.bytes) {
          size += bytes.byteLength;

          if (size > content.byteSize || size > maximumDumpBytes) {
            throw new Error('Dump exceeds declared size');
          }
          await file.writeFile(bytes);
        }
        await file.close();

        if (size !== content.byteSize) {
          throw new Error('Incomplete upload');
        }

        const type = dumpHeaderType(await readDumpHeader(temporary));
        let createdAt: Date;

        if (requiredType && type !== requiredType) {
          throw new BusinessError(BusinessErrorCode.Forbidden, 'Only a full site archive is available');
        }
        if (type === SiteDumpType.Site) {
          const prepared = await this.prepare(siteId, temporary, directory);

          createdAt = prepared.createdAt;
          await rm(prepared.directory, { recursive: true, force: true });
        } else {
          await this.partials().inspect(siteId, temporary, directory);
          createdAt = new Date(String((await readDumpHeader(temporary)).createdAt));
        }

        const savedName = archiveName(createdAt);

        await rename(temporary, child(directory, savedName));

        return metadata(savedName, size, type);
      } catch (error) {
        await file.close().catch(() => {});

        if (error instanceof BusinessError) {
          throw error;
        }
        throw new BusinessError(BusinessErrorCode.Validation, 'Invalid or incompatible site dump');
      } finally {
        await rm(temporary, { force: true });
      }
    });
  }

  private async prepare(siteId: string, filename: string, parent: string): Promise<IPreparedDump> {
    const schema = await this.database.schema();
    const directory = await mkdtemp(child(parent, '.restore-'));
    const documents = path.join(directory, 'documents.jsonl');
    const output = await open(documents, 'wx', 0o600);
    let header: Record<string, unknown> | null = null;
    let layout: IDumpLayout | null = null;
    let active: { file: Awaited<ReturnType<typeof open>>;
      size: number;
      expected: number;
      hash: ReturnType<typeof createHash> } | null = null;
    const paths = new Set<string>();

    try {
      for await (const record of readDumpRecords(filename)) {
        if (!header) {
          if (
            record.kind !== 'header'
            || record.format !== 'zarya-site'
            || record.version !== 1
            || record.siteId !== siteId
            || record.schema !== schema.signature
            || typeof record.createdAt !== 'string'
            || !Number.isFinite(Date.parse(record.createdAt))
            || new Date(record.createdAt).toISOString() !== record.createdAt
            || JSON.stringify(record.collections) !== JSON.stringify(schema.collections)
          ) {
            throw new Error('Incompatible dump');
          }

          layout = readLayout(record.layout);

          if (layout.mediaDomain && !this.settings.mediaRoot) {
            throw new Error('Media storage is required');
          }
          header = record;

          for (const area of ['sources', 'media', 'artifacts']) {
            await mkdir(path.join(directory, area));
          }

          if (layout.sourceKey) {
            await mkdir(child(path.join(directory, 'sources'), layout.sourceKey));
          }
          continue;
        }
        if (active) {
          if (
            record.kind === 'chunk'
            && typeof record.data === 'string'
            && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(record.data)
          ) {
            const bytes = Buffer.from(record.data, 'base64');

            active.size += bytes.length;

            if (bytes.length > 65536 || active.size > active.expected) {
              throw new Error('File exceeds declared size');
            }
            active.hash.update(bytes);
            await active.file.writeFile(bytes);
          } else if (
            record.kind === 'fileEnd'
            && active.size === active.expected
            && record.checksum === active.hash.digest('hex')
          ) {
            await active.file.close();
            active = null;
          } else {
            throw new Error('Corrupt file');
          }
          continue;
        }
        if (record.kind === 'document' && typeof record.collection === 'string' && typeof record.bytes === 'string') {
          await output.writeFile(JSON.stringify({ collection: record.collection, bytes: record.bytes }) + '\n');
        } else if (
          (record.kind === 'file'
          || record.kind === 'directory')
          && typeof record.path === 'string'
          && ['sources', 'media', 'artifacts'].includes(String(record.area))
        ) {
          const area = String(record.area);
          const relative = record.path;
          const identity = area + ':' + record.path.toLowerCase();

          if (
            paths.has(identity)
            || area === 'sources'
            && !layout!.sourceKey
            || area === 'media'
            && !layout!.mediaDomain
            || area === 'artifacts'
            && !layout!.artifactDirectories
              .some((prefix) => relative.startsWith(prefix + '/'))
          ) {
            throw new Error('Duplicate or foreign file path');
          }
          paths.add(identity);
          const root = area === 'sources' ? child(path.join(directory, 'sources'), layout!.sourceKey!)
            : path.join(directory, area);
          const target = child(root, record.path);

          if (record.kind === 'directory') {
            await mkdir(target, { recursive: true });
          } else {
            if (typeof record.size !== 'number' || !Number.isSafeInteger(record.size) || record.size < 0) {
              throw new Error('Invalid file size');
            }
            await mkdir(path.dirname(target), { recursive: true });
            active = {
              file: await open(target, 'wx', 0o600), size: 0, expected: record.size, hash: createHash('sha256'),
            };
          }
        } else {
          throw new Error('Invalid dump record');
        }
      }

      if (!header || !layout || active) {
        throw new Error('Incomplete dump');
      }
      await output.close();
      const sources = path.join(directory, 'sources');

      await validateDumpConfigs(sources);
      await reconcileDumpElements(sources, siteId, documents);
      const match = await new FileRenderingSourceAdapter(sources).locate(siteId);

      if ((match?.key ?? null) !== layout.sourceKey) {
        throw new Error('Source ownership mismatch');
      }

      const metadata = await this.database.describe(siteId, documents);
      const legacy = artifactDirectories(metadata);
      const named = artifactDirectories(metadata, true);
      const allowed = new Set([...legacy, ...named]);

      if (
        layout.mediaDomain !== null
        && layout.mediaDomain !== metadata.site.primaryDomain
        || layout.artifactDirectories.length !== legacy.length
        || new Set(layout.artifactDirectories).size !== legacy.length
        || layout.artifactDirectories.some((directory) => !allowed.has(directory))
        || metadata.releases.filter((release) => release.state === 'Ready').some((release) =>
          layout!.artifactDirectories.filter((directory) =>
            directory.endsWith('/' + encodeURIComponent(String(release._id))))
            .length !== 1)
      ) {
        throw new Error('File ownership mismatch');
      }
      if (layout.mediaDomain) {
        const media = path.join(directory, 'media');
        const marker = child(media, '.site.json');
        const contents = await readFile(marker, 'utf8').catch((error: unknown) => {
          if (!missing(error)) {
            throw error;
          }

          return null;
        });
        const owner: unknown = contents === null ? { siteId } : JSON.parse(contents);

        if (!owner || typeof owner !== 'object' || !('siteId' in owner) || owner.siteId !== siteId) {
          throw new Error('Foreign media directory');
        }
        if (contents === null) {
          await writeFile(marker, JSON.stringify({ siteId }));
        }

        for (const name of ['images', 'files', '.private']) {
          await mkdir(child(media, name), { recursive: true });
        }
      }

      for (const relative of layout.artifactDirectories) {
        const manifest = child(path.join(directory, 'artifacts'), relative + '/manifest.json');
        const release = metadata.releases.find((item) => relative.endsWith('/' + encodeURIComponent(String(item._id))));
        const value: unknown = JSON.parse(await readFile(manifest, 'utf8'));

        if (
          !isDeepStrictEqual(value, release?.manifest)
          || !value
          || typeof value !== 'object'
          || !('artifacts' in value)
          || !Array.isArray(value.artifacts)
        ) {
          throw new Error('Published manifest mismatch');
        }

        const artifacts: unknown[] = value.artifacts;

        for (const value of artifacts) {
          const item = record(value);

          if (
            typeof item.path !== 'string'
            || typeof item.public !== 'boolean'
            || typeof item.byteSize !== 'number'
            || typeof item.checksum !== 'string'
          ) {
            throw new Error('Invalid artifact metadata');
          }

          const filename = child(path.join(directory, 'artifacts'),
            relative + '/' + (item.public ? 'public/' : '') + item.path);

          if ((await lstat(filename)).size !== item.byteSize || await fileHash(filename) !== item.checksum) {
            throw new Error('Corrupt published artifact');
          }
        }
      }

      return { directory, documents, metadata, layout, createdAt: new Date(String(header.createdAt)) };
    } catch (error) {
      await active?.file.close().catch(() => {});
      await output.close().catch(() => {});
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }

  async restore(siteId: string, filename: string, options?: ISiteDumpApplication, actorId?: string,
    hookChange?: IHookCommitIntent, requiredType?: SiteDumpType.Site): Promise<void> {
    requireDumpFilename(filename);
    await this.exclusive(async () => {
      const directory = await this.directory(siteId);
      const archive = await checked(directory, filename);
      let prepared: IPreparedDump;
      let areas: readonly DumpFileArea[] = Object.values(DumpFileArea);

      try {
        const type = dumpHeaderType(await readDumpHeader(archive));

        if (requiredType && type !== requiredType) {
          throw new BusinessError(BusinessErrorCode.Forbidden, 'Only a full site archive is available');
        }
        if (type === SiteDumpType.Site) {
          if (options) {
            throw new BusinessError(BusinessErrorCode.Validation, 'Full-site restores have no item selection');
          }
          prepared = await this.prepare(siteId, archive, directory);
        } else {
          if (!options) {
            throw new BusinessError(BusinessErrorCode.Validation, 'Review and select partial import contents');
          }

          const partial = await this.partials().prepare(siteId, archive, options, directory, actorId);

          prepared = partial.prepared;
          areas = partial.areas;
        }
      } catch (error) {
        if (missing(error)) {
          throw new BusinessError(BusinessErrorCode.NotFound, 'Dump not found');
        }
        if (error instanceof BusinessError) {
          throw error;
        }
        throw new BusinessError(BusinessErrorCode.Validation, 'Invalid or incompatible site dump');
      }
      const work = prepared.directory;
      const journalPath = child(this.settings.root, '.restore-journal.json');
      let journal: IRestoreJournal | null = null;
      let committed = false;

      try {
        const before = await this.database.capture(siteId, path.join(work, 'before.jsonl'));
        const currentSource = await new FileRenderingSourceAdapter(this.settings.sourcesRoot).locate(siteId);
        const oldLayout: IDumpLayout = {
          sourceKey: currentSource?.key ?? null,
          mediaDomain: this.settings.mediaRoot ? String(before.site.primaryDomain) : null,
          artifactDirectories: await this.artifactDirectories(before),
        };
        const swaps = await this.stageSwaps(prepared, oldLayout, areas);

        journal = {
          siteId,
          before: before.fingerprint,
          after: prepared.metadata.fingerprint,
          swaps,
          artifactDomain: normalizeSiteHostname(String(prepared.metadata.site.primaryDomain)),
        };
        await writeFile(journalPath, JSON.stringify(journal), { flag: 'wx', mode: 0o600 });
        let swapping = false;

        try {
          await this.database.replace(siteId, prepared.documents, before, async () => {
            swapping = true;
            await applySwaps(swaps);
          }, hookChange);
        } catch (error) {
          if (!swapping) {
            if (options?.omitUnresolvedFiles && error instanceof Error && 'code' in error && error.code === 121) {
              throw new BusinessError(BusinessErrorCode.Validation, 'Add-on data requires a file reference');
            }
            throw error;
          }

          const actual = await this.database.capture(siteId, path.join(work, 'outcome.jsonl')).catch(() => null);

          if (actual?.fingerprint === journal.before) {
            await rollbackSwaps(swaps);
            throw error;
          } else if (actual?.fingerprint === journal.after) { /* commit acknowledged by scoped data */ } else {
            this.recoveryPending = true;
            this.maintenance.failClosed();
            throw new Error('Restore outcome requires recovery');
          }
        }
        committed = true;
        await this.finishJournal(journalPath, journal, true);
      } catch (error) {
        if (journal && !this.maintenanceFailed()) {
          try {
            await this.finishJournal(journalPath, journal, committed);
          } catch {
            this.recoveryPending = true;
            this.maintenance.failClosed();
          }
        }
        throw error;
      } finally {
        await rm(work, { recursive: true, force: true });
      }
    });
  }

  private recoveryPending = false;

  private maintenanceFailed(): boolean {
    return this.recoveryPending;
  }

  private async stageSwaps(prepared: IPreparedDump, current: IDumpLayout,
    areas: readonly DumpFileArea[]): Promise<IDirectorySwap[]> {
    const result: IDirectorySwap[] = [];
    const groups = [
      {
        root: this.settings.sourcesRoot,
        area: 'sources',
        old: current.sourceKey ? [current.sourceKey] : [],
        next: prepared.layout.sourceKey ? [prepared.layout.sourceKey] : [],
      },
      {
        root: this.settings.mediaRoot,
        area: 'media',
        old: current.mediaDomain ? [current.mediaDomain] : [],
        next: prepared.layout.mediaDomain ? [prepared.layout.mediaDomain] : [],
      },
      {
        root: this.settings.artifactsRoot,
        area: 'artifacts',
        old: current.artifactDirectories,
        next: prepared.layout.artifactDirectories,
      },
    ];
    const artifactDomain = normalizeSiteHostname(String(prepared.metadata.site.primaryDomain));
    const namedParent = await checked(this.settings.artifactsRoot, 'sites/' + artifactDomain);

    if (
      prepared.layout.artifactDirectories.some((directory) =>
        directory.startsWith('sites/' + artifactDomain + '/'))
    ) {
      const exists = await lstat(namedParent).catch((error: unknown) => {
        if (!missing(error)) {
          throw error;
        }

        return null;
      });

      if (exists) {
        const marker = record(JSON.parse(await readFile(await checked(namedParent, '.site.json'), 'utf8')));

        if (marker.siteId !== prepared.metadata.site._id) {
          throw new Error('Foreign publication directory');
        }
      }
    }

    try {
      for (const group of groups) {
        if (!group.root || !areas.some((area) => area === group.area)) {
          continue;
        }

        for (const target of new Set([...group.old, ...group.next])) {
          const live = await checked(group.root, target);
          const exists = await lstat(live).then(() => true).catch((error: unknown) => {
            if (!missing(error)) {
              throw error;
            }

            return false;
          });

          if (
            exists
            && !group.old.includes(target)
            && (group.area !== 'artifacts'
            || (await readdir(live)).length !== 0)
          ) {
            throw new Error('Restore target is already occupied: ' + group.area + '/' + target);
          }

          const prefix = path.posix.dirname(target);
          const id = randomUUID();
          const staged = (prefix === '.' ? '' : prefix + '/') + '.restore-' + id + '-new';
          const previous = (prefix === '.' ? '' : prefix + '/') + '.restore-' + id + '-old';
          const source = group.area === 'media' ? path.join(prepared.directory, 'media')
            : child(path.join(prepared.directory, group.area), target);

          await mkdir(path.dirname(await checked(group.root, staged)), { recursive: true });

          if (group.next.includes(target)) {
            await cp(source, child(group.root, staged), { recursive: true });
          } else {
            await mkdir(child(group.root, staged));
          }
          result.push({ root: group.root, target, staged, previous, hadOriginal: exists });
        }
      }

      return result;
    } catch (error) {
      for (const swap of result) {
        await rm(await checked(swap.root, swap.staged), { recursive: true, force: true });
      }
      throw error;
    }
  }

  private async finishJournal(filename: string, journal: IRestoreJournal, committed: boolean): Promise<void> {
    if (!committed) {
      await rollbackSwaps(journal.swaps);
    }

    for (const swap of journal.swaps) {
      await rm(await checked(swap.root, swap.previous), { recursive: true, force: true });
      await rm(await checked(swap.root, swap.staged), { recursive: true, force: true });
    }

    if (committed && this.settings.mediaRoot) {
      // Resolve from the restored registered domain on the next media operation.
      await rm(await checked(this.settings.mediaRoot, '.storage-index/' + journal.siteId + '.json'), { force: true });
    }
    if (committed) {
      if (
        journal.artifactDomain
        && journal.swaps.some((swap) =>
          path.resolve(swap.root) === path.resolve(this.settings.artifactsRoot)
        && swap.target.startsWith('sites/' + journal.artifactDomain + '/'))
      ) {
        const marker = await checked(this.settings.artifactsRoot, 'sites/' + journal.artifactDomain + '/.site.json');
        const owner = await readFile(marker, 'utf8').then((bytes) => record(JSON.parse(bytes)))
          .catch((error: unknown) => {
            if (!missing(error)) {
              throw error;
            }

            return null;
          });

        if (owner && owner.siteId !== journal.siteId) {
          throw new Error('Foreign publication directory');
        }
        if (!owner) {
          await writeFile(marker, JSON.stringify({ siteId: journal.siteId }), { flag: 'wx' });
        }
      }
      await rm(await checked(this.settings.artifactsRoot,
        'sites/.storage-index/' + journal.siteId + '.json'), { force: true });
    }
    await rm(filename, { force: true });
  }

  async recover(): Promise<void> {
    await mkdir(this.settings.root, { recursive: true, mode: 0o700 });
    await recoverCaptureJobs(this.settings.root);
    await new FileDeliveryRestoreGuard(this.settings.root).assertRestorable();

    for (const relative of ['.operation.lock', '.coordination/.operation.lock']) {
      const lockPath = await checked(this.settings.root, relative);
      const pid = await readFile(lockPath, 'utf8').catch((error: unknown) => {
        if (!missing(error)) {
          throw error;
        }

        return null;
      });

      if (pid !== null) {
        try {
          process.kill(Number(pid), 0);
          throw new Error('Dump process is active');
        } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) {
            throw error;
          }
        }
        await rm(lockPath);
      }
    }

    const filename = await checked(this.settings.root, '.restore-journal.json');
    const value = await readFile(filename, 'utf8').catch((error: unknown) => {
      if (!missing(error)) {
        throw error;
      }

      return null;
    });

    if (value === null) {
      return;
    }

    const journal = readJournal(JSON.parse(value));
    const roots = [this.settings.sourcesRoot, this.settings.artifactsRoot, this.settings.mediaRoot].filter(Boolean);

    if (
      !/^[A-Za-z0-9_-]{1,128}$/.test(journal.siteId)
      || !Array.isArray(journal.swaps)
      || journal.swaps.some((swap) => !roots.includes(swap.root)
        || !path.posix.basename(swap.staged).startsWith('.restore-')
        || !path.posix.basename(swap.previous).startsWith('.restore-'))
    ) {
      throw new Error('Invalid restore journal');
    }

    const directory = await this.directory(journal.siteId);
    const probe = child(directory, '.recovery-' + randomUUID());

    try {
      const actual = await this.database.capture(journal.siteId, probe);

      if (actual.fingerprint !== journal.before && actual.fingerprint !== journal.after) {
        throw new Error('Cannot reconcile interrupted site restore');
      }
      await this.finishJournal(filename, journal, actual.fingerprint === journal.after);
    } finally {
      await rm(probe, { force: true });
    }
  }
}

import type { IHookCommitIntent } from '../../../../domain/hooks/hook-execution.js';
