import { type ISiteDump, type ISiteDumpCreation, SiteDumpType } from '../../../../domain/dumps/site-dump.js';
import type { IAddonDumpMetadata } from '../../runtime/addons/addon-package-registry.js';
import type { IDumpCaptureLease } from '../files/dump-capture-lease.js';
import type { IDumpStorageSettings } from '../files/site-dump-store.adapter.js';

export function readCaptureMessage(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid capture message');
  }

  return Object.fromEntries(Object.entries(value));
}

export function readCompletedDump(value: unknown, expectedType: SiteDumpType): ISiteDump {
  const result = readCaptureMessage(value);

  if (
    !(result.createdAt instanceof Date)
    || !Number.isFinite(result.createdAt.getTime())
    || typeof result.filename !== 'string'
    || result.type !== expectedType
    || !result.filename.startsWith(result.createdAt.toISOString().replace(/[:.]/g, '-') + '_')
    || !/^[0-9TZ_-]+[a-f0-9-]{36}\.jsonl\.gz$/.test(result.filename)
    || typeof result.byteSize !== 'number'
    || !Number.isSafeInteger(result.byteSize)
    || result.byteSize < 1
    || result.missingFileReferences !== undefined
    && (expectedType !== SiteDumpType.Addons
      || typeof result.missingFileReferences !== 'number'
    || !Number.isSafeInteger(result.missingFileReferences)
      || result.missingFileReferences < 1)
  ) {
    throw new Error('Invalid completed dump metadata');
  }

  return {
    filename: result.filename,
    type: expectedType,
    byteSize: result.byteSize,
    createdAt: result.createdAt,
    ...(typeof result.missingFileReferences === 'number'
      ? { missingFileReferences: result.missingFileReferences } : {}),
  };
}

export enum CaptureMessageKind { Start = 'start', Result = 'result', Failure = 'failure' }

export interface IDumpCaptureStart {
  readonly kind: CaptureMessageKind.Start;
  readonly lease: IDumpCaptureLease;
  readonly stagingRoot: string;
  readonly storage: IDumpStorageSettings;
  readonly database: string;
  readonly addonMetadata: IAddonDumpMetadata;
  readonly options?: ISiteDumpCreation;
}
