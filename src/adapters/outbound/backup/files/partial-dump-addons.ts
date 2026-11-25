import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';

import { mongo } from 'mongoose';

import { SiteAddon, SiteAddonStatus } from '../../../../domain/addons/site-addon.js';
import {
  DumpItemAction, type IDumpItem, type ISiteDumpApplication, type ISiteDumpCreation,
  type ISiteDumpReview, SiteDumpType,
} from '../../../../domain/dumps/site-dump.js';
import { BusinessError, BusinessErrorCode } from '../../../../domain/shared/business-error.js';
import { nameKey } from '../../persistence/media-records.js';
import type { IAddonCollectionTransfer, IRuntimeAddonRegistration } from '../../runtime/addons/addon-package.types.js';
import { packageConfiguration } from '../../runtime/addons/addon-package-configuration.js';
import { packageObject, readAddonDefinition, readTransferCollections }
  from '../../runtime/addons/addon-package-manifest.js';
import { AddonPackageRegistry, type IAddonDumpMetadata } from '../../runtime/addons/addon-package-registry.js';
import { databaseRecords, decodeDocument, encodeDocument } from '../mongoose/dump-database.adapter.js';
import { child, treeRecords } from './dump-files.js';
import type { IPartialAddonTransfer } from './partial-dump.adapter.js';
import type { IPartialDump } from './partial-dump-archive.js';

const omittedReference = Symbol('omittedReference');

function visitFields(value: unknown, parts: readonly string[],
  apply: (value: string) => string | typeof omittedReference): unknown {
  if (!parts.length) {
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof value !== 'string') {
      throw new Error('Invalid add-on reference');
    }

    return apply(value);
  }
  if (value === null || value === undefined) {
    return value;
  }

  const [head, ...tail] = parts;

  if (head === '*') {
    if (!Array.isArray(value)) {
      throw new Error('Invalid reference array');
    }

    return value.map((child: unknown) => visitFields(child, tail, apply)).filter((item) => item !== omittedReference);
  }

  const item = packageObject(value);

  if (!head || !Object.hasOwn(item, head)) {
    return value;
  }

  const next = visitFields(item[head], tail, apply);

  if (next === omittedReference) {
    delete item[head];
  } else {
    item[head] = next;
  }

  return item;
}

function archivedFiles(member: Record<string, unknown>): ReadonlyMap<string, string | null> {
  const files = new Map<string, string | null>();

  if (member.files === undefined) {
    return files;
  }
  if (!Array.isArray(member.files)) {
    throw new Error('Invalid file mapping');
  }

  for (const value of member.files) {
    const { fileId, address } = packageObject(value);

    if (
      typeof fileId !== 'string'
      || files.has(fileId)
      || address !== null
      && (typeof address !== 'string'
      || !/^(?:images|files)\/.+/.test(address))
    ) {
      throw new Error('Invalid file mapping');
    }
    files.set(fileId, address);
  }

  return files;
}

export function missingAddonDumpFiles(dump: IPartialDump): number {
  return dump.addons.reduce((count, member) =>
    count + [...archivedFiles(member).values()].filter((address) => address === null).length, 0);
}

class TargetFiles {
  private readonly identities = new Set<string>();
  private readonly addresses = new Map<string, string | null>();

  add({ fileId, publicPaths }: mongo.Document): void {
    if (typeof fileId !== 'string' || !Array.isArray(publicPaths)) {
      return;
    }
    this.identities.add(fileId);

    for (const path of publicPaths) {
      if (typeof path === 'string') {
        const key = nameKey(path);
        const current = this.addresses.get(key);

        this.addresses.set(key, current === undefined || current === fileId ? fileId : null);
      }
    }
  }

  match(fileId: string, address: string | null, sameSite: boolean): string | null {
    if (sameSite && this.identities.has(fileId)) {
      return fileId;
    }

    return address === null ? null : this.addresses.get(nameKey(address)) ?? null;
  }
}

async function* ownedRows(filename: string): AsyncGenerator<{
  owner: string; collection: string; bytes: string; document: mongo.Document;
}> {
  const input = createReadStream(filename);
  const lines = createInterface({ input, crlfDelay: Infinity });

  try {
    for await (const line of lines) {
      const row = packageObject(JSON.parse(line));

      if (typeof row.owner !== 'string' || typeof row.collection !== 'string' || typeof row.bytes !== 'string') {
        throw new Error('Invalid owned snapshot record');
      }
      yield { owner: row.owner, collection: row.collection, bytes: row.bytes, document: decodeDocument(row.bytes) };
    }
  } finally {
    lines.close();
    input.destroy();
  }
}

export class FileAddonDumpTransfer implements IPartialAddonTransfer {
  constructor(private readonly packages: AddonPackageRegistry) {}

  async items(): Promise<readonly IDumpItem[]> {
    return this.packages.registrations().map((addon) => ({
      id: addon.definition.addonKey,
      key: addon.definition.addonKey,
      name: addon.definition.name.ru + ' / ' + addon.definition.name.en,
    }));
  }

  async *records(
    siteId: string, options: ISiteDumpCreation, documents: string,
  ): AsyncGenerator<Record<string, unknown>> {
    yield* FileAddonDumpTransfer.exportRecords(this.packages.dumpMetadata(), siteId, options, documents);
  }

  static async *exportRecords(
    metadata: IAddonDumpMetadata, siteId: string, options: ISiteDumpCreation, documents: string,
  ):
  AsyncGenerator<Record<string, unknown>> {
    const parts = options.addonParts ?? { configuration: true, businessData: true, package: false };
    const selected = metadata.registrations.filter((item) =>
      options.itemIds?.includes(item.definition.addonKey));

    if (selected.length !== options.itemIds?.length) {
      throw new BusinessError(BusinessErrorCode.StaleWrite, 'Selected add-ons changed');
    }

    const pageTitles = new Map<string, string>();
    const mediaPaths = new Map<string, string>();
    const connections = new Map<string, string>();

    for await (const row of databaseRecords(documents)) {
      if (row.collection !== 'sites' && row.document.siteId !== siteId) {
        throw new Error('Foreign site snapshot');
      }
      if (row.collection === 'pages') {
        pageTitles.set(String(row.document._id), String(row.document.title));
      }
      if (
        row.collection === 'media_files'
        && typeof row.document.fileId === 'string'
        && typeof row.document.publicPaths?.[0] === 'string'
      ) {
        mediaPaths.set(row.document.fileId, row.document.publicPaths[0]);
      }
      if (row.collection === 'site_addons') {
        connections.set(String(row.document.addonKey), row.bytes);
      }
    }

    for (const addon of selected) {
      const key = addon.definition.addonKey;
      const collections = addon.transfer?.collections;

      if ((parts.businessData || parts.package) && !collections) {
        throw new BusinessError(BusinessErrorCode.AddonUnavailable, 'The add-on has no portable runtime contract');
      }

      const pages = new Set<string>();
      const files = new Set<string>();

      if (parts.businessData) {
        for await (const row of databaseRecords(documents)) {
          const owner = collections?.find((item) => item.name === row.collection);

          for (const reference of owner?.references ?? []) {
            const selected = reference.collection === 'pages' ? pages
              : reference.collection === 'media_files' ? files : null;

            if (!selected) {
              continue;
            }
            visitFields(row.document, reference.path.split('.'), (id) => {
              selected.add(id);

              return id;
            });
          }
        }
      }

      const directory = parts.package ? addon.packageDirectory ?? path.resolve('dist/addon-packages', key) : null;

      if (directory) {
        const manifest = await AddonPackageRegistry.validateSnapshotPackage(directory, metadata);

        if (manifest.definition.addonKey !== key) {
          throw new Error('Foreign runtime package');
        }
      }
      yield {
        kind: 'addon',
        addon: {
          addonKey: key,
          definition: addon.definition,
          collections: collections ?? [],
          ...(parts.configuration ? { connection: connections.get(key) ?? null } : {}),
          pages: [...pages].map((pageId) => {
            const title = pageTitles.get(pageId);

            if (!title) {
              throw new BusinessError(BusinessErrorCode.Scope, 'Add-on references a missing site page');
            }

            return { pageId, title };
          }),
          ...(files.size ? {
            files: [...files].map((fileId) => ({ fileId, address: mediaPaths.get(fileId) ?? null })),
          } : {}),
          package: directory !== null,
        },
      };

      if (parts.businessData) {
        for await (const row of databaseRecords(documents)) {
          if (collections?.some((item) => item.name === row.collection)) {
            yield { kind: 'document', owner: key, collection: row.collection, bytes: row.bytes };
          }
        }
      }
      if (directory) {
        for await (const record of treeRecords(directory, 'packages')) {
          yield { ...record, ...(typeof record.path === 'string' ? { path: key + '/' + record.path } : {}) };
        }
      }
    }
  }

  private async registrations(dump: IPartialDump, install: boolean, selected?: ReadonlySet<string>):
  Promise<Map<string, IRuntimeAddonRegistration>> {
    const result = new Map<string, IRuntimeAddonRegistration>();
    const claimed = new Set<string>();

    for (const member of dump.addons) {
      const definition = readAddonDefinition(member.definition);
      const key = definition.addonKey;
      const collections = readTransferCollections(member.collections);

      if (member.addonKey !== key) {
        throw new Error('Invalid add-on member identity');
      }

      for (const collection of collections) {
        if (claimed.has(collection.name)) {
          throw new Error('Several add-ons claim the same data');
        }
        claimed.add(collection.name);
      }

      if (member.package === true) {
        const directory = child(path.join(dump.directory, 'packages'), key);
        const manifest = await this.packages.validatePackage(directory);

        if (
          JSON.stringify(manifest.definition) !== JSON.stringify(definition)
          || JSON.stringify(manifest.collections) !== JSON.stringify(collections)
        ) {
          throw new Error('Package/member mismatch');
        }
        if (install && selected?.has(key)) {
          await this.packages.install(directory);
        }
      } else if (dump.addonParts?.package) {
        throw new Error('Package contents are missing');
      }

      const existing = this.packages.registrations().find((item) => item.definition.addonKey === key);

      if (
        existing
        && (existing.definition.implementationVersion !== definition.implementationVersion
        || JSON.stringify(readTransferCollections(existing.transfer?.collections ?? []))
          !== JSON.stringify(collections))
      ) {
        throw new BusinessError(BusinessErrorCode.Conflict, 'Installed add-on contract differs from the archive');
      }
      if (existing) {
        result.set(key, existing);
      }
    }

    return result;
  }

  async review(siteId: string, dump: IPartialDump, current: string): Promise<ISiteDumpReview> {
    await this.registrations(dump, false);
    const connections = new Map<string, string>();
    const targetFiles = new TargetFiles();
    const targetPages: { pageId: string; title: string }[] = [];

    for await (const row of databaseRecords(current)) {
      if (row.collection !== 'sites' && row.document.siteId !== siteId) {
        throw new Error('Foreign target snapshot');
      }
      if (row.collection === 'site_addons') {
        connections.set(String(row.document.addonKey), String(row.document._id));
      }
      if (row.collection === 'pages') {
        targetPages.push({ pageId: String(row.document._id), title: String(row.document.title) });
      }
      if (row.collection === 'media_files') {
        targetFiles.add(row.document);
      }
    }
    const pages = new Map<string, string>();
    const allowed = new Map<string, Set<string>>();

    for (const member of dump.addons) {
      const key = String(member.addonKey);

      allowed.set(key, new Set(readTransferCollections(member.collections).map((item) => item.name)));

      if (!Array.isArray(member.pages)) {
        throw new Error('Invalid page mapping catalogue');
      }

      for (const value of member.pages) {
        const page = packageObject(value);

        if (typeof page.pageId !== 'string' || typeof page.title !== 'string') {
          throw new Error('Invalid page mapping');
        }
        pages.set(page.pageId, page.title);
      }
    }

    for await (const row of ownedRows(dump.documents)) {
      if (
        !dump.addonParts?.businessData
        || !allowed.get(row.owner)?.has(row.collection)
        || row.document.siteId !== dump.siteId
      ) {
        throw new Error('Foreign add-on data');
      }
    }

    return {
      type: SiteDumpType.Addons,
      version: '',
      targetPages,
      pages: [...pages].map(([pageId, title]) => ({ pageId, title })),
      addonParts: dump.addonParts!,
      allowFileOmission: siteId !== dump.siteId,
      items: dump.addons.map((member) => {
        const definition = readAddonDefinition(member.definition);
        const targetId = connections.get(definition.addonKey) ?? null;
        const unresolved = [...archivedFiles(member)].filter(([fileId, address]) =>
          !targetFiles.match(fileId, address, siteId === dump.siteId)).length;

        return {
          id: definition.addonKey,
          key: definition.addonKey,
          name: definition.name.ru + ' / ' + definition.name.en,
          action: targetId ? DumpItemAction.Replace : DumpItemAction.Create,
          targetId,
          ...(unresolved ? { unresolvedFileReferences: unresolved } : {}),
          targets: targetId ? [{ id: targetId, key: definition.addonKey, name: definition.name.en }] : [],
        };
      }),
    };
  }

  async merge(siteId: string, dump: IPartialDump, options: ISiteDumpApplication, documents: string,
    actorId: string): Promise<void> {
    const available = dump.addonParts!;
    const parts = options.addonParts ?? available;

    if (
      !Object.values(parts).some(Boolean)
      || parts.configuration
      && !available.configuration
      || parts.businessData
      && !available.businessData
      || parts.package
      && !available.package
      || !options.choices.length
    ) {
      throw new BusinessError(BusinessErrorCode.Validation, 'Invalid add-on selection');
    }

    const selected = new Set(options.choices.map((item) => item.id));

    if (
      selected.size !== options.choices.length
      || [...selected].some((key) =>
        !dump.addons.some((item) => item.addonKey === key))
    ) {
      throw new BusinessError(BusinessErrorCode.Validation, 'Unknown selected add-on');
    }

    const connections = new Map<string, mongo.Document>();
    const targetPages = new Set<string>();
    const targetMedia = new TargetFiles();
    const mediaMappings = new Map<string, string>();
    const sameSite = siteId === dump.siteId;

    for await (const row of databaseRecords(documents)) {
      if (row.collection === 'site_addons') {
        connections.set(String(row.document.addonKey), row.document);
      }
      if (row.collection === 'pages') {
        targetPages.add(String(row.document._id));
      }
      if (row.collection === 'media_files') {
        targetMedia.add(row.document);
      }
    }

    for (const member of dump.addons) {
      for (const [fileId, address] of archivedFiles(member)) {
        const destination = targetMedia.match(fileId, address, sameSite);

        if (destination) {
          mediaMappings.set(JSON.stringify([member.addonKey, fileId]), destination);
        }
      }
    }
    const collections = new Map<string, IAddonCollectionTransfer>();
    const configurationRows: mongo.Document[] = [];

    for (const choice of options.choices) {
      if ((connections.get(choice.id)?._id ?? null) !== choice.targetId) {
        throw new BusinessError(BusinessErrorCode.StaleWrite, 'Add-on connection changed');
      }
    }

    // Validate page choices before evaluating or registering any uploaded installation package.
    if (parts.businessData) {
      for await (const row of ownedRows(dump.documents)) {
        if (!selected.has(row.owner)) {
          continue;
        }

        const member = dump.addons.find((item) => item.addonKey === row.owner)!;
        const descriptor = readTransferCollections(member.collections).find((item) => item.name === row.collection);

        if (!descriptor) {
          throw new Error('Unknown add-on collection');
        }

        for (const reference of descriptor.references) {
          if (reference.collection === 'media_files') {
            visitFields(row.document, reference.path.split('.'), (from) => {
              if (!sameSite && !options.omitUnresolvedFiles && !mediaMappings.has(JSON.stringify([row.owner, from]))) {
                throw new BusinessError(BusinessErrorCode.Validation, 'Add-on file has no unique target path');
              }

              return from;
            });
            continue;
          }
          if (reference.collection !== 'pages') {
            continue;
          }
          visitFields(row.document, reference.path.split('.'), (from) => {
            if (!options.pageMappings?.[from] || !targetPages.has(options.pageMappings[from]!)) {
              throw new BusinessError(BusinessErrorCode.Validation,
                'Map every referenced page to an owned target page');
            }

            return from;
          });
        }
      }
    }

    const registrations = await this.registrations(dump, parts.package, selected);

    for (const choice of options.choices) {
      const registration = registrations.get(choice.id);
      const member = dump.addons.find((item) => item.addonKey === choice.id)!;
      const current = connections.get(choice.id);

      if (!registration) {
        throw new BusinessError(BusinessErrorCode.AddonUnavailable, 'Select the installation package first');
      }
      if ((current?._id ?? null) !== choice.targetId) {
        throw new BusinessError(BusinessErrorCode.StaleWrite, 'Add-on connection changed');
      }

      const source = parts.configuration && typeof member.connection === 'string'
        ? decodeDocument(member.connection) : null;

      if (source && (source.siteId !== dump.siteId || source.addonKey !== choice.id)) {
        throw new Error('Foreign add-on connection');
      }

      const configuration = source ? packageConfiguration(source.configuration)
        : current ? packageConfiguration(current.configuration) : registration.defaultConfiguration?.();

      if (!configuration) {
        throw new BusinessError(BusinessErrorCode.AddonUnavailable, 'Default add-on configuration is unavailable');
      }
      registration.validate(configuration);
      const now = new Date();
      const state = new SiteAddon({
        siteAddonId: current ? String(current._id) : randomUUID(),
        siteId,
        addonKey: choice.id,
        configuration,
        status: source?.status === SiteAddonStatus.Disabled ? SiteAddonStatus.Disabled
          : source ? SiteAddonStatus.Enabled : current?.status === SiteAddonStatus.Disabled
            ? SiteAddonStatus.Disabled : SiteAddonStatus.Enabled,
        version: randomUUID(),
        createdAt: current?.createdAt instanceof Date ? current.createdAt : now,
        updatedAt: now,
        createdBy: current ? String(current.createdBy) : actorId,
        updatedBy: actorId,
      }).toState();
      const { siteAddonId, ...fields } = state;

      configurationRows.push({ _id: siteAddonId, ...fields, operationGuard: 0 });

      if (parts.businessData) {
        for (const item of registration.transfer?.collections ?? []) {
          collections.set(item.name, item);
        }
      }
    }
    const identities = new Map<string, string>();

    for await (const row of ownedRows(dump.documents)) {
      if (!parts.businessData || !selected.has(row.owner)) {
        continue;
      }

      const descriptor = collections.get(row.collection);

      if (!descriptor || typeof row.document._id !== 'string') {
        throw new Error('Unknown imported business identity');
      }

      const value = siteId === dump.siteId ? row.document._id : descriptor.idFormat === 'sha256'
        ? createHash('sha256').update(siteId + ':' + randomUUID() + ':' + row.document._id).digest('hex')
        : randomUUID();
      const key = JSON.stringify([row.collection, row.document._id]);

      if (identities.has(key)) {
        throw new Error('Duplicate business identity');
      }
      identities.set(key, value);
    }
    const merged = documents + '.addons';
    const output = await open(merged, 'wx', 0o600);

    try {
      for await (const row of databaseRecords(documents)) {
        if (
          collections.has(row.collection)
          || row.collection === 'site_addons'
          && selected.has(String(row.document.addonKey))
        ) {
          continue;
        }
        await output.writeFile(JSON.stringify({ collection: row.collection, bytes: row.bytes }) + '\n');
      }

      for (const row of configurationRows) {
        await output.writeFile(JSON.stringify({ collection: 'site_addons', bytes: encodeDocument(row) }) + '\n');
      }

      for await (const row of ownedRows(dump.documents)) {
        if (!parts.businessData || !selected.has(row.owner)) {
          continue;
        }

        const descriptor = collections.get(row.collection)!;
        let document: unknown = mongo.BSON.deserialize(Buffer.from(row.bytes, 'base64'), { promoteValues: false });

        for (const reference of descriptor.references) {
          document = visitFields(document, reference.path.split('.'), (from) => {
            if (reference.collection === 'pages') {
              const to = options.pageMappings?.[from];

              if (!to || !targetPages.has(to)) {
                throw new BusinessError(BusinessErrorCode.Validation,
                  'Map every referenced page to an owned target page');
              }

              return to;
            }
            if (reference.collection === 'media_files') {
              return mediaMappings.get(JSON.stringify([row.owner, from])) ?? (sameSite ? from : omittedReference);
            }

            const mapped = identities.get(JSON.stringify([reference.collection, from]));

            if (!mapped) {
              throw new BusinessError(BusinessErrorCode.Validation, 'Dangling business reference');
            }

            return mapped;
          });
        }
        const fields = packageObject(document);

        fields._id = identities.get(JSON.stringify([row.collection, row.document._id]))!;
        fields.siteId = siteId;
        await output.writeFile(JSON.stringify({ collection: row.collection, bytes: encodeDocument(fields) }) + '\n');
      }
      await output.close();
      await rename(merged, documents);
    } finally {
      await output.close().catch(() => {});
      await rm(merged, { force: true });
    }
  }
}
