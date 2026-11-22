import { object, request } from '../../shared/api/content-api';

export interface ISiteFavicon {
  readonly byteSize: number;
  readonly width: number;
  readonly height: number;
  readonly version: string;
}

function positiveInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error('Invalid favicon metadata');
  }

  return value;
}

export async function deleteSiteFavicon(siteId: string): Promise<void> {
  await request('/' + encodeURIComponent(siteId) + '/favicon/delete', {});
}

export async function siteFavicon(siteId: string, file?: File): Promise<ISiteFavicon | null> {
  const response = object(await request('/' + encodeURIComponent(siteId) + '/favicon',
    file ? { filename: file.name } : undefined, 120000, undefined, file));

  if (response.favicon === null && !file) {
    return null;
  }

  const value = object(response.favicon);

  if (
    typeof value.version !== 'string'
    || !/^[a-f0-9]{64}$/.test(value.version)
  ) {
    throw new Error('Invalid favicon metadata');
  }

  return {
    byteSize: positiveInteger(value.byteSize),
    width: positiveInteger(value.width),
    height: positiveInteger(value.height),
    version: value.version,
  };
}
