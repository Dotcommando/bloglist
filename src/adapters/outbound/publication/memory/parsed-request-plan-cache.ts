import type { IStoredRequestPlan } from '../../../../domain/publication/published-document.js';

interface IParsedPlanCacheLimits {
  readonly maxEntries?: number;
  readonly maxBytes?: number;
}

interface IParsedPlanEntry {
  readonly value: IStoredRequestPlan;
  readonly bytes: number;
}

/** Verified immutable plans, never active-release or live access decisions. */
export class ParsedRequestPlanCache {
  private readonly entries = new Map<string, IParsedPlanEntry>();
  private readonly pending = new Map<string, Promise<IStoredRequestPlan | null>>();
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private bytes = 0;
  private generation = 0;
  private closed = false;
  private hits = 0;
  private misses = 0;

  constructor(limits: IParsedPlanCacheLimits = {}) {
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
      throw new RangeError('Invalid parsed plan cache limits');
    }
  }

  async resolve(siteId: string, releaseId: string, planId: string,
    load: () => Promise<IStoredRequestPlan | null>): Promise<IStoredRequestPlan | null> {
    if (this.closed) {
      throw new Error('Parsed plan cache is closed');
    }

    const key = JSON.stringify([siteId, releaseId, planId]);
    const cached = this.entries.get(key);

    if (cached) {
      this.hits++;
      this.entries.delete(key);
      this.entries.set(key, cached);

      return structuredClone(cached.value);
    }

    let pending = this.pending.get(key);

    if (!pending) {
      this.misses++;
      const generation = this.generation;

      pending = Promise.resolve().then(load).then((value) => {
        if (value && !this.closed && generation === this.generation) {
          this.retain(key, value);
        }

        return value;
      }).finally(() => {
        if (this.pending.get(key) === pending) {
          this.pending.delete(key);
        }
      });

      if (this.pending.size < 128) {
        this.pending.set(key, pending);
      }
    }

    const value = await pending;

    return value === null ? null : structuredClone(value);
  }

  private retain(key: string, value: IStoredRequestPlan): void {
    const bytes = JSON.stringify(value).length * 4 + key.length * 2 + 1024;

    if (bytes > this.maxBytes) {
      return;
    }

    const previous = this.entries.get(key);

    if (previous) {
      this.entries.delete(key);
      this.bytes -= previous.bytes;
    }

    while (this.entries.size >= this.maxEntries || this.bytes + bytes > this.maxBytes) {
      const oldest = this.entries.entries().next().value;

      if (!oldest) {
        break;
      }
      this.entries.delete(oldest[0]);
      this.bytes -= oldest[1].bytes;
    }
    this.entries.set(key, { value: structuredClone(value), bytes });
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

  snapshot(): { entries: number; bytes: number; pending: number; hits: number; misses: number } {
    return {
      entries: this.entries.size,
      bytes: this.bytes,
      pending: this.pending.size,
      hits: this.hits,
      misses: this.misses,
    };
  }
}
