import {
  type IPublishedDocument, PublishedDataUnavailableError, RequestCacheStatus,
} from '../../../domain/publication/published-document.js';
import type { IRequestDocumentCachePort } from '../../../ports/outbound/publication/request-document-cache.port.js';

export interface IRequestCacheFillSettings {
  readonly maxFills: number;
  readonly maxWaiters: number;
  readonly fillTimeoutMs: number;
}

interface IFill {
  readonly cancellation: AbortController;
  readonly promise: Promise<IPublishedDocument>;
  waiters: number;
  readonly background?: boolean;
}

export interface IRequestCacheRefresh {
  readonly generate: (signal: AbortSignal) => Promise<IPublishedDocument>;
  readonly bytes: number;
}

interface IScheduledRefresh {
  readonly timer: ReturnType<typeof setTimeout>;
  readonly bytes: number;
}

export class RequestDocumentCacheService {
  private readonly fills = new Map<string, IFill>();
  private waiters = 0;
  private active = 0;
  private readonly shutdown = new AbortController();
  private closed = false;
  private readonly scheduled = new Map<string, IScheduledRefresh>();
  private readonly refreshing = new Set<AbortController>();
  private readonly unsubscribe: (() => void) | undefined;
  private scheduledBytes = 0;
  private refreshFailures = 0;
  private refreshRefusals = 0;
  private refreshCompleted = 0;

  constructor(private readonly store: IRequestDocumentCachePort,
    private readonly settings: IRequestCacheFillSettings = { maxFills: 128, maxWaiters: 1024, fillTimeoutMs: 10000 }) {
    if (
      !Number.isSafeInteger(settings.maxFills)
      || settings.maxFills < 1
      || settings.maxFills > 256
      || !Number.isSafeInteger(settings.maxWaiters)
      || settings.maxWaiters < settings.maxFills
      || settings.maxWaiters > 4096
      || !Number.isSafeInteger(settings.fillTimeoutMs)
      || settings.fillTimeoutMs < 1
      || settings.fillTimeoutMs > 10000
    ) {
      throw new RangeError('Invalid Request cache fill limits');
    }
    this.settings = Object.freeze({ ...settings });
    this.unsubscribe = store.onInvalidation?.(() => this.cancelRefreshes());
  }

  snapshot(): { fills: number; waiters: number } {
    return { fills: this.active, waiters: this.waiters };
  }

  refreshSnapshot(): {
    scheduled: number; bytes: number; active: number; completed: number; failures: number; refusals: number;
  } {
    return {
      scheduled: this.scheduled.size,
      bytes: this.scheduledBytes,
      active: this.refreshing.size,
      completed: this.refreshCompleted,
      failures: this.refreshFailures,
      refusals: this.refreshRefusals,
    };
  }

  private cancelRefreshes(): void {
    for (const entry of this.scheduled.values()) {
      clearTimeout(entry.timer);
    }
    this.scheduled.clear();
    this.scheduledBytes = 0;

    for (const cancellation of this.refreshing) {
      cancellation.abort();
    }
  }

  private scheduleRefresh(key: string, siteId: string, ttlMs: number, expiresAt: number,
    generation: number, refresh: IRequestCacheRefresh): void {
    const prior = this.scheduled.get(key);

    if (prior) {
      clearTimeout(prior.timer);
      this.scheduled.delete(key);
      this.scheduledBytes -= prior.bytes;
    }
    if (
      this.closed
      || ttlMs <= 20000
      || this.store.generation() !== generation
      || this.store.get(key)?.expiresAt !== expiresAt
    ) {
      return;
    }
    if (
      !Number.isSafeInteger(refresh.bytes)
      || refresh.bytes < 1
      || this.scheduled.size >= 256
      || this.scheduledBytes + refresh.bytes > 8388608
    ) {
      this.refreshRefusals++;

      return;
    }

    const timer = setTimeout(() => {
      if (this.scheduled.get(key)?.timer !== timer) {
        return;
      }
      this.scheduled.delete(key);
      this.scheduledBytes -= refresh.bytes;
      this.startRefresh(key, siteId, ttlMs, expiresAt, generation, refresh);
    }, Math.max(0, expiresAt - this.store.now() - 20000));

    timer.unref?.();
    this.scheduled.set(key, { timer, bytes: refresh.bytes });
    this.scheduledBytes += refresh.bytes;
  }

  private startRefresh(key: string, siteId: string, ttlMs: number, expiresAt: number,
    generation: number, refresh: IRequestCacheRefresh): void {
    if (
      this.closed
      || this.store.generation() !== generation
      || this.store.get(key)?.expiresAt !== expiresAt
      || expiresAt <= this.store.now()
    ) {
      return;
    }

    const fillKey = generation + ':' + key;

    if (this.fills.has(fillKey)) {
      return;
    }
    if (this.active >= this.settings.maxFills - 1 || this.refreshing.size >= 17) {
      this.refreshRefusals++;

      return;
    }

    const cancellation = new AbortController();
    const combined = AbortSignal.any([cancellation.signal, AbortSignal.timeout(this.settings.fillTimeoutMs)]);

    this.refreshing.add(cancellation);
    const promise = this.generate(refresh.generate, combined).then((document) => {
      combined.throwIfAborted();

      if (document.cacheable !== false && this.store.generation() === generation) {
        const deadline = this.store.now() + ttlMs;

        this.store.put(key, { siteId, expiresAt: deadline, document });
        this.scheduleRefresh(key, siteId, ttlMs, deadline, generation, refresh);
      }

      return document;
    }).finally(() => {
      this.refreshing.delete(cancellation);
      this.fills.delete(fillKey);
    });

    this.fills.set(fillKey, { cancellation, promise, waiters: 0, background: true });
    void promise.then(() => {
      this.refreshCompleted++;
    }, () => {
      this.refreshFailures++;
    });
  }

  async resolve(key: string, siteId: string, ttlMs: number,
    generate: (signal: AbortSignal) => Promise<IPublishedDocument>, signal?: AbortSignal,
    refresh?: IRequestCacheRefresh): Promise<IPublishedDocument> {
    signal?.throwIfAborted();

    if (this.closed) {
      throw new PublishedDataUnavailableError();
    }

    const cached = this.store.get(key);

    if (cached && cached.expiresAt > this.store.now()) {
      return { ...cached.document, cacheStatus: RequestCacheStatus.Hit };
    }
    if (this.waiters >= this.settings.maxWaiters) {
      throw new PublishedDataUnavailableError();
    }

    const generation = this.store.generation();
    const fillKey = `${generation}:${key}`;
    let fill = this.fills.get(fillKey);
    const shared = fill !== undefined;

    if (!fill) {
      if (this.active >= this.settings.maxFills) {
        throw new PublishedDataUnavailableError();
      }

      const cancellation = new AbortController();
      const deadline = AbortSignal.timeout(this.settings.fillTimeoutMs);
      const combined = AbortSignal.any([cancellation.signal, deadline]);
      const promise = this.generate(generate, combined).then((document) => {

        combined.throwIfAborted();

        if (document.cacheable !== false && this.store.generation() === generation) {
          const expiresAt = this.store.now() + ttlMs;

          this.store.put(key, { siteId, expiresAt, document });

          if (refresh) {
            this.scheduleRefresh(key, siteId, ttlMs, expiresAt, generation, refresh);
          }
        }

        return document;
      }).finally(() => {
        this.fills.delete(fillKey);
      });

      fill = { cancellation, promise, waiters: 0 };
      this.fills.set(fillKey, fill);
    }

    const selected = fill;

    selected.waiters++;
    this.waiters++;

    try {
      const document = await this.wait(selected.promise, signal);

      // A fallback belongs to its own request; it cannot be shared with other consumers.
      if (shared && document.cacheable === false) {
        if (this.active >= this.settings.maxFills) {
          throw new PublishedDataUnavailableError();
        }

        const own = await this.generate(generate, AbortSignal.any([
          AbortSignal.timeout(this.settings.fillTimeoutMs), ...(signal ? [signal] : []),
        ]));

        return { ...own, cacheStatus: RequestCacheStatus.Bypass };
      }

      return {
        ...document,
        cacheStatus: document.cacheable === false ? RequestCacheStatus.Bypass
          : shared ? RequestCacheStatus.Coalesced : RequestCacheStatus.Miss,
      };
    } catch (error) {
      if (!signal?.aborted && error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) {
        throw new PublishedDataUnavailableError('Request cache fill unavailable', { cause: error });
      }
      throw error;
    } finally {
      selected.waiters--;
      this.waiters--;

      if (!selected.waiters && !selected.background) {
        selected.cancellation.abort();
      }
    }
  }

  private async generate(operation: (signal: AbortSignal) => Promise<IPublishedDocument>,
    signal: AbortSignal): Promise<IPublishedDocument> {
    if (this.active >= this.settings.maxFills) {
      throw new PublishedDataUnavailableError();
    }

    const combined = AbortSignal.any([signal, this.shutdown.signal]);

    combined.throwIfAborted();
    this.active++;
    const work = Promise.resolve().then(() => {
      combined.throwIfAborted();

      return operation(combined);
    }).finally(() => {
      this.active--;
    });

    return this.wait(work, combined);
  }

  private async wait<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) {
      return promise;
    }

    let abort!: () => void;

    try {
      return await Promise.race([promise, new Promise<never>((_resolve, reject) => {
        abort = () => reject(signal.reason);
        signal.addEventListener('abort', abort, { once: true });

        if (signal.aborted) {
          abort();
        }
      })]);
    } finally {
      signal.removeEventListener('abort', abort);
    }
  }

  onModuleDestroy(): void {
    this.closed = true;
    this.unsubscribe?.();
    this.cancelRefreshes();
    this.shutdown.abort();

    for (const fill of this.fills.values()) {
      fill.cancellation.abort();
    }
    this.store.purge();
  }
}
