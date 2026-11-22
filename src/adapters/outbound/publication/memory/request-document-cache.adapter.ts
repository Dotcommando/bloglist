import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import type {
  IRequestDocumentCacheEntry, IRequestDocumentCachePort,
} from '../../../../ports/outbound/publication/request-document-cache.port.js';

export interface IRequestCacheMemorySettings {
  readonly maxEntries: number;
  readonly maxBodyBytes: number;
  readonly maxTotalBytes: number;
}

export function validateRequestCacheMemorySettings(input: Partial<IRequestCacheMemorySettings> = {}):
IRequestCacheMemorySettings {
  const settings = { maxEntries: 256, maxBodyBytes: 2097152, maxTotalBytes: 33554432, ...input };

  if (
    Object.values(settings).some((value) => !Number.isSafeInteger(value))
    || settings.maxEntries < 1
    || settings.maxEntries > 4096
    || settings.maxBodyBytes < 1024
    || settings.maxBodyBytes > 8388608
    || settings.maxTotalBytes < settings.maxBodyBytes
    || settings.maxTotalBytes > 268435456
  ) {
    throw new RangeError('Invalid Request cache memory budgets');
  }

  return Object.freeze(settings);
}

export class MemoryRequestDocumentCacheAdapter implements IRequestDocumentCachePort {
  private readonly invalidation = new Set<() => void>();

  onInvalidation(listener: () => void): () => void {
    this.invalidation.add(listener);

    return () => {
      this.invalidation.delete(listener);
    };
  }

  private readonly entries = new Map<string, { entry: IRequestDocumentCacheEntry; bytes: number }>();
  private readonly settings: IRequestCacheMemorySettings;
  private bytes = 0;
  private epoch = 0;

  constructor(settings: Partial<IRequestCacheMemorySettings> = {}) {
    this.settings = validateRequestCacheMemorySettings(settings);
  }

  now(): number {
    return performance.now();
  }

  generation(): number {
    return this.epoch;
  }

  digest(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  snapshot(): { entries: number; bytes: number } {
    return { entries: this.entries.size, bytes: this.bytes };
  }

  get(key: string): IRequestDocumentCacheEntry | null {
    const stored = this.entries.get(key);

    if (!stored) {
      return null;
    }
    this.remove(key);

    if (stored.entry.expiresAt <= this.now()) {
      return null;
    }
    this.entries.set(key, stored);
    this.bytes += stored.bytes;

    return structuredClone(stored.entry);
  }

  put(key: string, entry: IRequestDocumentCacheEntry): void {
    this.remove(key);
    const bodyBytes = Buffer.byteLength(entry.document.html) + Buffer.byteLength(entry.document.markdown ?? '');
    // UTF-16 strings plus bounded serialized metadata, key and per-entry bookkeeping.
    const bytes = 2 * (JSON.stringify(entry).length + key.length) + 256;

    if (
      bodyBytes > this.settings.maxBodyBytes
      || bytes > this.settings.maxTotalBytes
      || !Number.isFinite(entry.expiresAt)
      || entry.expiresAt <= this.now()
      || entry.document.cacheable === false
    ) {
      return;
    }

    for (const [id, stored] of this.entries) {
      if (stored.entry.expiresAt <= this.now()) {
        this.remove(id);
      }
    }

    while (this.entries.size >= this.settings.maxEntries || this.bytes + bytes > this.settings.maxTotalBytes) {
      const oldest = this.entries.keys().next().value;

      if (oldest === undefined) {
        return;
      }
      this.remove(oldest);
    }
    this.entries.set(key, { entry: structuredClone(entry), bytes });
    this.bytes += bytes;
  }

  purge(siteId?: string): void {
    this.epoch++;

    for (const listener of this.invalidation) {
      listener();
    }

    for (const [key, stored] of this.entries) {
      if (siteId === undefined || stored.entry.siteId === siteId) {
        this.remove(key);
      }
    }
  }

  private remove(key: string): void {
    const stored = this.entries.get(key);

    if (stored) {
      this.bytes -= stored.bytes;
      this.entries.delete(key);
    }
  }

  onModuleDestroy(): void {
    this.purge();
  }
}
