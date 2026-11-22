import { ContentRequestError, object, request, string } from '../../shared/api/content-api';
import { DumpType, type IDumpApplication, type IDumpCreation, type IDumpReview } from './dumps.types';

export interface ISiteDumpRow {
  readonly type: DumpType; readonly filename: string; readonly byteSize: number; readonly createdAt: string;
}

function dump(value: unknown): ISiteDumpRow {
  const row = object(value);
  const filename = string(row.filename);
  const createdAt = string(row.createdAt);

  if (
    !/^[A-Za-z0-9_.-]+\.jsonl\.gz$/.test(filename)
    || typeof row.byteSize !== 'number'
    || !Number.isSafeInteger(row.byteSize)
    || row.byteSize < 0
    || !Number.isFinite(Date.parse(createdAt))
  ) {
    throw new Error('Invalid dump response');
  }

  const type = Object.values(DumpType).find((type) => type === row.type) ?? DumpType.Unknown;

  return { type, filename, createdAt, byteSize: row.byteSize };
}

export function formatDumpSize(bytes: number): string {
  const units = ['KiB', 'MiB', 'GiB', 'TiB'];
  let size = bytes / 1024;
  let unit = 0;

  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }

  return size.toFixed(2) + ' ' + units[unit];
}

export function dumpDownloadUrl(siteId: string, filename: string): string {
  return '/api/admin/sites/' + encodeURIComponent(siteId) + '/dumps/' + encodeURIComponent(filename);
}

export async function listSiteDumps(siteId: string): Promise<ISiteDumpRow[]> {
  const result = object(await request('/' + encodeURIComponent(siteId) + '/dumps'));

  if (!Array.isArray(result.items)) {
    throw new Error('Invalid dump list');
  }

  return result.items.map(dump);
}

export async function createSiteDump(siteId: string, options?: IDumpCreation): Promise<ISiteDumpRow> {
  return dump(await request('/' + encodeURIComponent(siteId) + '/dumps/create', options ?? {}, 1800000));
}

export async function restoreSiteDump(siteId: string, filename: string, options?: IDumpApplication): Promise<void> {
  const result = object(await request('/' + encodeURIComponent(siteId) + '/dumps/'
    + encodeURIComponent(filename) + '/restore', options ?? {}, 1800000));

  if (result.restored !== true) {
    throw new Error('Unconfirmed restoration');
  }
}

export async function deleteSiteDump(siteId: string, filename: string): Promise<void> {
  const result = object(await request('/' + encodeURIComponent(siteId) + '/dumps/'
    + encodeURIComponent(filename) + '/delete', {}));

  if (result.deleted !== true) {
    throw new Error('Unconfirmed deletion');
  }
}

function review(value: unknown): IDumpReview {
  const row = object(value);
  const type = Object.values(DumpType).find((type) => type === row.type);

  if (!type || !Array.isArray(row.items) || !Array.isArray(row.pages) || !Array.isArray(row.targetPages)) {
    throw new Error('Invalid dump review');
  }

  const pages = (values: unknown[]): { pageId: string; title: string }[] => values.map((value) => {
    const item = object(value);

    return { pageId: string(item.pageId), title: string(item.title) };
  });

  return {
    type,
    version: string(row.version),
    items: row.items.map((value: unknown) => {
      const item = object(value);

      return {
        id: string(item.id),
        name: string(item.name),
        key: string(item.key),
        ...(item.action === undefined ? {} : { action: string(item.action) }),
        ...(item.targetId === undefined ? {} : { targetId: item.targetId === null ? null : string(item.targetId) }),
        ...(item.targets === undefined ? {} : {
          targets: (Array.isArray(item.targets) ? item.targets : []).map((value: unknown) => {
            const target = object(value);

            return { id: string(target.id), name: string(target.name), key: string(target.key) };
          }),
        }),
      };
    }),
    pages: pages(row.pages),
    targetPages: pages(row.targetPages),
    ...(row.addonParts === undefined ? {} : {
      addonParts: {
        configuration: object(row.addonParts).configuration === true,
        businessData: object(row.addonParts).businessData === true,
        package: object(row.addonParts).package === true,
      },
    }),
  };
}

export async function getDumpExportItems(siteId: string, type: DumpType): Promise<IDumpReview> {
  return review(await request('/' + encodeURIComponent(siteId) + '/dumps/options/' + type));
}

export async function inspectSiteDump(siteId: string, filename: string): Promise<IDumpReview> {
  const path = '/' + encodeURIComponent(siteId) + '/dumps/' + encodeURIComponent(filename) + '/inspect';

  return review(await request(path));
}

export async function createInstallationDump(siteId: string): Promise<string> {
  return dump(await request('/' + encodeURIComponent(siteId) + '/dumps/installation/create', {}, 1800000)).filename;
}

export function installationDumpDownloadUrl(siteId: string, filename: string): string {
  return '/api/admin/sites/' + encodeURIComponent(siteId) + '/dumps/installation/' + encodeURIComponent(filename);
}

export async function restoreInstallationDump(siteId: string, file: File): Promise<void> {
  const result = object(await uploadDump(installationDumpDownloadUrl(siteId, 'restore'), file));

  if (result.restored !== true) {
    throw new Error('Unconfirmed installation restoration');
  }
}

export async function importSiteDump(siteId: string, file: File): Promise<ISiteDumpRow> {
  return dump(await uploadDump('/api/admin/sites/' + encodeURIComponent(siteId) + '/dumps/import', file));
}

async function uploadDump(url: string, file: File): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'X-Zarya-Admin': '1', 'Content-Type': 'application/gzip' },
    body: file,
  });

  if (!response.ok) {
    const error: unknown = await response.json().catch(() => null);

    throw new ContentRequestError(response.status, error && typeof error === 'object' && 'error' in error
      && typeof error.error === 'string' ? error.error : 'InternalError');
  }

  return response.json();
}
