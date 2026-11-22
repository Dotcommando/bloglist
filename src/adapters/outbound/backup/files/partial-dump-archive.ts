import { createHash } from 'node:crypto';
import { mkdir, open } from 'node:fs/promises';
import path from 'node:path';

import { type IAddonDumpParts, SiteDumpType } from '../../../../domain/dumps/site-dump.js';
import type { IRenderingElementState } from '../../../../domain/rendering/rendering-element.js';
import { readElement } from '../../rendering/files/element-codec.js';
import { decodeDocument } from '../mongoose/dump-database.adapter.js';
import { readDumpRecords } from './dump-archive.js';
import { child } from './dump-files.js';
import { dumpHeaderType } from './dump-format.js';
import { dumpElementKind } from './partial-dump-elements.js';

export interface IPartialDump {
  readonly type: SiteDumpType;
  readonly siteId: string;
  readonly createdAt: Date;
  readonly elements: readonly IRenderingElementState[];
  readonly documents: string;
  readonly directory: string;
  readonly addons: readonly Record<string, unknown>[];
  readonly addonParts?: IAddonDumpParts;
}

export function dumpObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected dump object');
  }

  return Object.fromEntries(Object.entries(value));
}

export function readAddonParts(value: unknown): IAddonDumpParts {
  const parts = dumpObject(value);

  if (
    typeof parts.configuration !== 'boolean'
    || typeof parts.businessData !== 'boolean'
    || typeof parts.package !== 'boolean'
    || !Object.values(parts).some(Boolean)
    || Object.keys(parts).some((key) => !['configuration', 'businessData', 'package'].includes(key))
  ) {
    throw new Error('Invalid add-on contents');
  }

  return { configuration: parts.configuration, businessData: parts.businessData, package: parts.package };
}

/** Never evaluates uploaded configuration or package code during archive review. */
export async function extractPartialDump(filename: string, directory: string): Promise<IPartialDump> {
  await mkdir(directory, { recursive: true });
  const documents = path.join(directory, 'documents.jsonl');
  const output = await open(documents, 'wx', 0o600);
  const elements: IRenderingElementState[] = [];
  const addons: Record<string, unknown>[] = [];
  let header: Record<string, unknown> | null = null;
  let type = SiteDumpType.Unknown;
  let sourceSiteId = '';
  const names = new Set<string>();
  let active: { file: Awaited<ReturnType<typeof open>>;
    size: number;
    expected: number;
    hash: ReturnType<typeof createHash> } | null = null;

  try {
    for await (const row of readDumpRecords(filename)) {
      if (!header) {
        type = dumpHeaderType(row);

        if (
          type === SiteDumpType.Site
          || typeof row.siteId !== 'string'
          || !/^[A-Za-z0-9_-]{1,128}$/.test(row.siteId)
          || typeof row.createdAt !== 'string'
          || !Number.isFinite(Date.parse(row.createdAt))
          || new Date(row.createdAt).toISOString() !== row.createdAt
        ) {
          throw new Error('Invalid partial header');
        }
        if (type === SiteDumpType.Addons) {
          readAddonParts(row.addonParts);
        }
        header = row;
        sourceSiteId = row.siteId;
        continue;
      }
      if (active) {
        if (
          row.kind === 'chunk'
          && typeof row.data === 'string'
          && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(row.data)
        ) {
          const bytes = Buffer.from(row.data, 'base64');

          active.size += bytes.length;

          if (bytes.length > 65536 || active.size > active.expected) {
            throw new Error('Invalid chunk size');
          }
          active.hash.update(bytes);
          await active.file.writeFile(bytes);
        } else if (
          row.kind === 'fileEnd'
          && active.size === active.expected
          && row.checksum === active.hash.digest('hex')
        ) {
          await active.file.close();
          active = null;
        } else {
          throw new Error('Invalid file framing');
        }
        continue;
      }

      const kind = dumpElementKind(type);

      if (kind && row.kind === 'element') {
        const element = readElement(row.element);

        if (
          element.siteId !== sourceSiteId
          || element.kind !== kind
          || elements.some((item) => item.elementId === element.elementId || item.key === element.key)
        ) {
          throw new Error('Mixed or duplicate element categories');
        }
        elements.push(element);
      } else if (type === SiteDumpType.Addons && row.kind === 'addon') {
        const addon = dumpObject(row.addon);

        if (
          typeof addon.addonKey !== 'string'
          || !/^[a-z][a-z0-9-]{0,63}$/.test(addon.addonKey)
          || addons.some((item) => item.addonKey === addon.addonKey)
        ) {
          throw new Error('Invalid add-on member');
        }
        addons.push(addon);
      } else if (
        (type === SiteDumpType.Files
        || type === SiteDumpType.Addons)
        && row.kind === 'document'
        && typeof row.collection === 'string'
        && typeof row.bytes === 'string'
      ) {
        const document = decodeDocument(row.bytes);

        if (
          document.siteId !== sourceSiteId
          || type === SiteDumpType.Files
          && !['assets', 'media_libraries'].includes(row.collection)
          || type === SiteDumpType.Addons
          && (typeof row.owner !== 'string'
            || !addons.some((addon) => addon.addonKey === row.owner))
        ) {
          throw new Error('Foreign document');
        }
        await output.writeFile(JSON.stringify(row) + '\n');
      } else if (
        (type === SiteDumpType.Files
        || type === SiteDumpType.Addons)
        && (row.kind === 'file'
        || row.kind === 'directory')
        && typeof row.path === 'string'
      ) {
        const area = type === SiteDumpType.Files ? 'media' : 'packages';

        if (row.area !== area || type === SiteDumpType.Addons && !readAddonParts(header.addonParts).package) {
          throw new Error('Mixed file categories');
        }

        const identity = area + ':' + row.path.normalize('NFC').toLowerCase();

        if (names.has(identity)) {
          throw new Error('Duplicate file path');
        }
        names.add(identity);
        const target = child(path.join(directory, area), row.path);

        if (row.kind === 'directory') {
          await mkdir(target, { recursive: true });
        } else {
          if (typeof row.size !== 'number' || !Number.isSafeInteger(row.size) || row.size < 0) {
            throw new Error('Invalid file size');
          }
          await mkdir(path.dirname(target), { recursive: true });
          active = { file: await open(target, 'wx', 0o600), size: 0, expected: row.size, hash: createHash('sha256') };
        }
      } else {
        throw new Error('Mixed or unsupported dump records');
      }
    }

    if (
      !header
      || active
      || dumpElementKind(type)
      && !elements.length
      || type === SiteDumpType.Addons
      && !addons.length
    ) {
      throw new Error('Incomplete partial dump');
    }
    await mkdir(path.join(directory, 'media'), { recursive: true });

    return {
      type,
      siteId: sourceSiteId,
      createdAt: new Date(String(header.createdAt)),
      elements,
      documents,
      directory,
      addons,
      ...(type === SiteDumpType.Addons ? { addonParts: readAddonParts(header.addonParts) } : {}),
    };
  } catch (error) {
    await active?.file.close().catch(() => {});
    throw error;
  } finally {
    await output.close();
  }
}
