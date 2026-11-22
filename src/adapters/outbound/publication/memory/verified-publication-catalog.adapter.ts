import { ReleaseState } from '../../../../domain/publication/publication-release.js';
import {
  PublicationConsistencyError, PublishedDataUnavailableError,
} from '../../../../domain/publication/published-document.js';
import { PublishedRouteKind } from '../../../../domain/publication/published-route.js';
import type { IPublicationStorePort } from '../../../../ports/outbound/publication/publication-store.port.js';
import type { IPublishedPageCatalogPort } from '../../../../ports/outbound/publication/published-page-catalog.port.js';

interface ICatalogLimits {
  readonly maxEntries?: number;
  readonly maxBytes?: number;
}

export class VerifiedPublicationCatalogAdapter implements IPublishedPageCatalogPort {
  private readonly entries = new Map<string, { pageIds: readonly string[]; bytes: number }>();
  private readonly pending = new Map<string, Promise<readonly string[] | null>>();
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private bytes = 0;
  private active = 0;
  private generation = 0;
  private closed = false;
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private refusals = 0;

  constructor(private readonly store: Pick<IPublicationStorePort, 'read'>, limits: ICatalogLimits = {}) {
    this.maxEntries = limits.maxEntries ?? 128;
    this.maxBytes = limits.maxBytes ?? 33554432;

    if (
      !Number.isSafeInteger(this.maxEntries)
      || this.maxEntries < 1
      || this.maxEntries > 4096
      || !Number.isSafeInteger(this.maxBytes)
      || this.maxBytes < 1
      || this.maxBytes > 268435456
    ) {
      throw new RangeError('Invalid publication catalog limits');
    }
  }

  async readPublishedPageIds(siteId: string, releaseId: string): Promise<readonly string[] | null> {
    if (this.closed) {
      throw new PublishedDataUnavailableError('Publication catalog is closed');
    }

    const key = JSON.stringify([siteId, releaseId]);
    const cached = this.entries.get(key);

    if (cached) {
      this.hits++;
      this.entries.delete(key);
      this.entries.set(key, cached);

      return [...cached.pageIds];
    }

    let pending = this.pending.get(key);

    if (!pending) {
      if (this.active >= 128) {
        this.refusals++;
        throw new PublishedDataUnavailableError('Publication catalog admission exhausted');
      }
      this.misses++;
      this.active++;
      const generation = this.generation;

      pending = Promise.resolve().then(() => this.load(siteId, releaseId)).then((pageIds) => {
        if (pageIds && !this.closed && generation === this.generation) {
          this.retain(key, pageIds);
        }

        return pageIds;
      }).finally(() => {
        this.active--;

        if (this.pending.get(key) === pending) {
          this.pending.delete(key);
        }
      });
      this.pending.set(key, pending);
    }

    const result = await pending;

    return result === null ? null : [...result];
  }

  private async load(siteId: string, releaseId: string): Promise<readonly string[] | null> {
    const release = await this.store.read(siteId, releaseId);

    if (!release) {
      return null;
    }
    if (
      release.siteId !== siteId
      || release.releaseId !== releaseId
      || release.state !== ReleaseState.Ready
      || !release.manifest
    ) {
      throw new PublicationConsistencyError('Publication catalog is unavailable or foreign');
    }

    return [...new Set(release.manifest.routes.flatMap((route) =>
      route.kind === PublishedRouteKind.Redirect ? [] : [route.pageId]))];
  }

  private retain(key: string, pageIds: readonly string[]): void {
    const bytes = JSON.stringify(pageIds).length * 4 + key.length * 2 + 1024;

    if (bytes > this.maxBytes) {
      this.refusals++;

      return;
    }

    while (this.entries.size >= this.maxEntries || this.bytes + bytes > this.maxBytes) {
      const oldest = this.entries.entries().next().value;

      if (!oldest) {
        break;
      }
      this.entries.delete(oldest[0]);
      this.bytes -= oldest[1].bytes;
      this.evictions++;
    }
    this.entries.set(key, { pageIds: [...pageIds], bytes });
    this.bytes += bytes;
  }

  purge(): void {
    this.generation++;
    this.entries.clear();
    this.pending.clear();
    this.bytes = 0;
  }

  onModuleDestroy(): void {
    this.closed = true;
    this.purge();
  }

  snapshot(): {
    entries: number; bytes: number; pending: number; hits: number; misses: number; evictions: number; refusals: number;
  } {
    return {
      entries: this.entries.size,
      bytes: this.bytes,
      pending: this.pending.size,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      refusals: this.refusals,
    };
  }
}
