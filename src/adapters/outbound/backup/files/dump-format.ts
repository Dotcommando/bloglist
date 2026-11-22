import { SiteDumpType } from '../../../../domain/dumps/site-dump.js';
import { readDumpRecords } from './dump-archive.js';

/** Listing reads only the first record; imports validate the entire archive and its footer. */
export async function readDumpHeader(filename: string): Promise<Record<string, unknown>> {
  for await (const record of readDumpRecords(filename)) {
    if (record.kind !== 'header') {
      throw new Error('Missing dump header');
    }

    return record;
  }

  throw new Error('Empty dump');
}

export function dumpHeaderType(header: Record<string, unknown>): SiteDumpType {
  if (
    header.format === 'zarya-site'
    && header.version === 1
    && (header.type === undefined
    || header.type === SiteDumpType.Site)
  ) {
    return SiteDumpType.Site;
  }

  const type = Object.values(SiteDumpType).find((type) => type === header.type);

  if (
    header.format !== 'zarya-partial'
    || header.version !== 1
    || !type
    || [SiteDumpType.Site, SiteDumpType.Unknown, SiteDumpType.Installation].includes(type)
  ) {
    throw new Error('Unsupported dump type');
  }

  return type;
}
