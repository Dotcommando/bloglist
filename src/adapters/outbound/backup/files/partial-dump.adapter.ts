import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, open, rm } from 'node:fs/promises';
import path from 'node:path';

import {
  type IDumpItem, type ISiteDumpApplication, type ISiteDumpCreation, type ISiteDumpReview,
  SiteDumpType,
} from '../../../../domain/dumps/site-dump.js';
import { TemplateSourceKind } from '../../../../domain/publication/render-plan.js';
import { BusinessError, BusinessErrorCode } from '../../../../domain/shared/business-error.js';
import { FileRenderingSourceAdapter } from '../../rendering/files/rendering-source.adapter.js';
import { databaseRecords, type DumpDatabase, encodeDocument } from '../mongoose/dump-database.adapter.js';
import { writeDumpRecords } from './dump-archive.js';
import { checked, child, fileHash, missing, treeRecords } from './dump-files.js';
import { DumpFileArea, type IPreparedDump } from './dump-prepared.js';
import { missingAddonDumpFiles } from './partial-dump-addons.js';
import { extractPartialDump, fileDumpCollections } from './partial-dump-archive.js';
import { dumpElementCatalog, dumpElementKind, mergeDumpElements, reviewDumpElements } from './partial-dump-elements.js';
import { mergeDumpMedia } from './partial-dump-media.js';

export interface IPartialAddonExport {
  records(siteId: string, options: ISiteDumpCreation, documents: string): AsyncIterable<Record<string, unknown>>;
}

export interface IPartialAddonTransfer extends IPartialAddonExport {
  items(siteId: string): Promise<readonly IDumpItem[]>;
  records(siteId: string, options: ISiteDumpCreation, documents: string): AsyncIterable<Record<string, unknown>>;
  review(siteId: string, dump: Awaited<ReturnType<typeof extractPartialDump>>, current: string):
  Promise<ISiteDumpReview>;
  merge(siteId: string, dump: Awaited<ReturnType<typeof extractPartialDump>>, options: ISiteDumpApplication,
    documents: string, actorId: string): Promise<void>;
}

export interface IPartialDumpSettings { readonly sourcesRoot: string; readonly mediaRoot?: string; }

export class FilePartialDumpAdapter {
  constructor(private readonly settings: IPartialDumpSettings, private readonly database: DumpDatabase,
    private readonly addons?: IPartialAddonTransfer,
    private readonly exporter: IPartialAddonExport | undefined = addons) {}

  private requireAddons(): IPartialAddonTransfer {
    if (!this.addons) {
      throw new BusinessError(BusinessErrorCode.AddonUnavailable, 'Add-on transfer is unavailable');
    }

    return this.addons;
  }

  async exportItems(siteId: string, type: SiteDumpType, parent: string): Promise<ISiteDumpReview> {
    const work = await mkdtemp(child(parent, '.catalog-'));

    try {
      const documents = path.join(work, 'current.jsonl');
      const current = await this.database.capture(siteId, documents);
      const kind = dumpElementKind(type);
      const elements = kind ? (await dumpElementCatalog(siteId, this.settings.sourcesRoot, documents))
        .filter((item) => item.kind === kind) : [];
      const items = type === SiteDumpType.Addons ? await this.requireAddons().items(siteId)
        : elements.map((item) => ({ id: item.elementId, key: item.key, name: item.name }));

      return {
        type,
        items,
        version: current.fingerprint,
        pages: [],
        targetPages: [],
        ...(type === SiteDumpType.Addons ? {
          addonParts: {
            configuration: true,
            businessData: true,
            package: false,
          },
        } : {}),
      };
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }

  async create(siteId: string, options: ISiteDumpCreation, filename: string, work: string): Promise<number> {
    const documents = path.join(work, 'current.jsonl');
    const current = await this.database.capture(siteId, documents);
    const kind = dumpElementKind(options.type);
    const catalog = kind ? (await dumpElementCatalog(siteId, this.settings.sourcesRoot, documents))
      .filter((item) => item.kind === kind) : [];
    const selected = catalog.filter((item) => options.itemIds?.includes(item.elementId));

    if (kind && selected.length !== options.itemIds?.length) {
      throw new BusinessError(BusinessErrorCode.StaleWrite, 'Selected sources changed');
    }

    const settings = this.settings;
    const addons = options.type === SiteDumpType.Addons ? this.exporter ?? this.requireAddons() : null;
    const records = async function* (): AsyncGenerator<Record<string, unknown>> {
      yield {
        kind: 'header',
        format: 'zarya-partial',
        version: 1,
        type: options.type,
        siteId,
        createdAt: new Date().toISOString(),
        ...(options.type === SiteDumpType.Addons ? {
          addonParts: options.addonParts ?? { configuration: true, businessData: true, package: false },
        } : {}),
      };

      if (kind) {
        for (const element of selected) {
          yield { kind: 'element', element };
        }
      } else if (options.type === SiteDumpType.Files) {
        if (!settings.mediaRoot) {
          throw new BusinessError(BusinessErrorCode.Validation, 'Media storage is required');
        }

        for await (const row of databaseRecords(documents)) {
          if (fileDumpCollections.has(row.collection)) {
            yield { kind: 'document', collection: row.collection, bytes: row.bytes };
          }
        }
        yield* treeRecords(await checked(settings.mediaRoot, String(current.site.primaryDomain)), 'media');
      } else if (addons) {
        yield* addons.records(siteId, options, documents);
      } else {
        throw new BusinessError(BusinessErrorCode.Validation, 'Invalid partial category');
      }
    };

    await writeDumpRecords(filename, records());
    const extracted = await extractPartialDump(filename, path.join(work, 'validation'));

    if (extracted.type !== options.type) {
      throw new Error('Invalid generated category');
    }

    return missingAddonDumpFiles(extracted);
  }

  async inspect(siteId: string, filename: string, parent: string): Promise<ISiteDumpReview> {
    const work = await mkdtemp(child(parent, '.review-'));

    try {
      return await this.reviewAt(siteId, filename, work);
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }

  private async reviewAt(siteId: string, filename: string, work: string): Promise<ISiteDumpReview> {
    const dump = await extractPartialDump(filename, path.join(work, 'incoming'));
    const documents = path.join(work, 'current.jsonl');
    const current = await this.database.capture(siteId, documents);
    const catalog = dump.elements.length ? await dumpElementCatalog(siteId, this.settings.sourcesRoot, documents) : [];
    const addonReview = dump.type === SiteDumpType.Addons
      ? await this.requireAddons().review(siteId, dump, documents) : null;
    const fingerprint = createHash('sha256').update(siteId + ':' + await fileHash(filename) + ':'
      + current.fingerprint + ':' + JSON.stringify(catalog)).digest('hex');

    return {
      type: dump.type,
      items: reviewDumpElements(catalog, dump.elements),
      pages: [],
      targetPages: [],
      ...addonReview,
      version: fingerprint,
    };
  }

  async prepare(siteId: string, filename: string, options: ISiteDumpApplication, parent: string,
    actorId?: string): Promise<{
    prepared: IPreparedDump; areas: readonly DumpFileArea[];
  }> {
    const work = await mkdtemp(child(parent, '.partial-'));

    try {
      const review = await this.reviewAt(siteId, filename, work);

      if (options.version !== review.version) {
        throw new BusinessError(BusinessErrorCode.StaleWrite, 'Import review changed');
      }

      const dump = await extractPartialDump(filename, path.join(work, 'import'));
      const documents = path.join(work, 'current.jsonl');
      const rows = new Map<string, { collection: string; bytes: string }>();
      const areas: DumpFileArea[] = [];
      const current = await this.database.describe(siteId, documents);
      const sources = path.join(work, 'sources');
      const located = await new FileRenderingSourceAdapter(this.settings.sourcesRoot).locate(siteId);

      await mkdir(sources);

      if (dump.elements.length) {
        if (!options.choices.length) {
          throw new BusinessError(BusinessErrorCode.Validation, 'Select sources to import');
        }
        if (located) {
          const from = await checked(this.settings.sourcesRoot, located.key);

          for await (const record of treeRecords(from, 'sources')) {
            if (!record.kind) {
              throw new Error('Invalid source');
            }
          }
          await cp(from, child(sources, located.key), { recursive: true, dereference: false });
        }

        const catalog = await dumpElementCatalog(siteId, this.settings.sourcesRoot, documents);
        const floors = new Map<TemplateSourceKind, bigint>();

        for await (const row of databaseRecords(documents)) {
          if (row.collection === 'rendering_element_sequences') {
            const kind = Object.values(TemplateSourceKind).find((kind) => kind === row.document.kind);

            if (kind) {
              floors.set(kind, BigInt(String(row.document.lastOrdinal)));
            }
          }
        }
        const merged = await mergeDumpElements(siteId, catalog, dump.elements, options.choices, sources, floors);

        for (const { elementId, ...fields } of merged) {
          const collection = 'rendering_elements';

          rows.set(JSON.stringify([collection, elementId]), {
            collection,
            bytes: encodeDocument({ _id: elementId, ...fields }),
          });
        }
        areas.push(DumpFileArea.Sources);
      } else if (dump.type === SiteDumpType.Files) {
        if (options.choices.length || !this.settings.mediaRoot) {
          throw new BusinessError(BusinessErrorCode.Validation, 'Files are imported together');
        }

        const media = path.join(work, 'media');
        const from = await checked(this.settings.mediaRoot, String(current.site.primaryDomain));

        await cp(from, media, { recursive: true, dereference: false }).catch((error: unknown) => {
          if (!missing(error)) {
            throw error;
          }
        });
        const merged = await mergeDumpMedia(siteId, dump.siteId, documents, dump.documents,
          path.join(dump.directory, 'media'), media);

        for (const row of merged.rows) {
          rows.set(JSON.stringify([row.collection, row.id]), row);
        }
        areas.push(DumpFileArea.Media);
      } else if (dump.type === SiteDumpType.Addons) {
        if (!actorId) {
          throw new BusinessError(BusinessErrorCode.Forbidden, 'Trusted import actor is required');
        }
        await this.requireAddons().merge(siteId, dump, options, documents, actorId);
      }

      const mergedFile = path.join(work, 'merged.jsonl');
      const output = await open(mergedFile, 'wx', 0o600);

      try {
        for await (const row of databaseRecords(documents)) {
          const key = JSON.stringify([row.collection, row.document._id]);
          const next = rows.get(key) ?? row;

          await output.writeFile(JSON.stringify({ collection: next.collection, bytes: next.bytes }) + '\n');
          rows.delete(key);
        }

        for (const row of rows.values()) {
          await output.writeFile(JSON.stringify(row) + '\n');
        }
      } finally {
        await output.close();
      }
      const metadata = await this.database.describe(siteId, mergedFile);
      const source = await new FileRenderingSourceAdapter(sources).locate(siteId);

      return {
        areas,
        prepared: {
          directory: work,
          documents: mergedFile,
          metadata,
          createdAt: dump.createdAt,
          layout: {
            sourceKey: source?.key ?? located?.key ?? null,
            mediaDomain: this.settings.mediaRoot ? String(current.site.primaryDomain) : null,
            artifactDirectories: [],
          },
        },
      };
    } catch (error) {
      await rm(work, { recursive: true, force: true });
      throw error;
    }
  }
}
