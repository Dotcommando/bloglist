import { performance } from 'node:perf_hooks';
import { Worker } from 'node:worker_threads';

import { LoaderPhase } from '../../../../domain/pages/page-rendering.js';
import {
  type IPublishedDocument, PublishedDataUnavailableError,
} from '../../../../domain/publication/published-document.js';
import { SnippetExecution } from '../../../../domain/rendering/snippet.js';
import type { ILoaderExecutionPort } from '../../../../ports/outbound/publication/loader-execution.port.js';
import type {
  IRequestDocumentGeneration, IRequestDocumentRefreshPort,
} from '../../../../ports/outbound/publication/request-document-refresh.port.js';
import { isTemplateObject } from '../modx/parameters.js';
import {
  readRefreshDocument, readRefreshMessage, RefreshMessageKind, type RefreshRegistration,
} from './request-refresh.protocol.js';

interface IRefreshLimits { readonly queueLimit?: number; readonly queueWaitMs?: number; readonly timeoutMs?: number }

interface IJob {
  readonly id: number;
  readonly input: IRequestDocumentGeneration;
  readonly signal: AbortSignal;
  readonly abort: () => void;
  readonly cancellation: AbortController;
  readonly resolve: (value: IPublishedDocument) => void;
  readonly reject: (error: Error) => void;
  readonly cost: number;
  readonly deadline: number;
  readonly bridges: Set<Promise<void>>;
  timer: ReturnType<typeof setTimeout>;
  calls: number;
  finishing: boolean;
}

export class RequestRefreshWorkerAdapter implements IRequestDocumentRefreshPort {
  private readonly queue: IJob[] = [];
  private readonly limits: Required<IRefreshLimits>;
  private readonly cleanup = new Set<Promise<void>>();
  private worker: Worker | null = null;
  private active: IJob | null = null;
  private closed = false;
  private sequence = 0;
  private bytes = 0;
  private refusals = 0;

  constructor(private readonly runner: URL, private readonly loaders: Pick<ILoaderExecutionPort, 'execute'>,
    private readonly registrations: readonly RefreshRegistration[], limits: IRefreshLimits = {}) {
    this.limits = Object.freeze({
      queueLimit: limits.queueLimit ?? 16,
      queueWaitMs: limits.queueWaitMs ?? 1000,
      timeoutMs: limits.timeoutMs ?? 10000,
    });

    if (
      !Number.isSafeInteger(this.limits.queueLimit)
      || this.limits.queueLimit < 1
      || this.limits.queueLimit > 16
      || !Number.isSafeInteger(this.limits.queueWaitMs)
      || this.limits.queueWaitMs < 1
      || this.limits.queueWaitMs > 1000
      || !Number.isSafeInteger(this.limits.timeoutMs)
      || this.limits.timeoutMs < 1
      || this.limits.timeoutMs > 10000
      || Buffer.byteLength(JSON.stringify(registrations)) > 8388608
    ) {
      throw new RangeError('Invalid document refresh limits');
    }
  }

  async regenerate(input: IRequestDocumentGeneration, signal: AbortSignal): Promise<IPublishedDocument> {
    signal.throwIfAborted();
    const serialized = JSON.stringify(input);
    const cost = serialized.length * 4 + 1024;

    if (
      this.closed
      || this.queue.length >= this.limits.queueLimit
      || this.bytes + cost > 33554432
      || Buffer.byteLength(serialized) > 8388608
    ) {
      this.refusals++;
      throw new PublishedDataUnavailableError('Background document admission exhausted');
    }

    return new Promise<IPublishedDocument>((resolve, reject) => {
      const job: IJob = {
        id: ++this.sequence,
        input: structuredClone(input),
        signal,
        abort: () => this.finish(job, undefined, new PublishedDataUnavailableError('Background document canceled')),
        cancellation: new AbortController(),
        resolve,
        reject,
        cost,
        deadline: performance.now() + this.limits.timeoutMs,
        bridges: new Set(),
        calls: 0,
        finishing: false,
        timer: setTimeout(() => this.finish(job, undefined,
          new PublishedDataUnavailableError('Background document queue expired')), this.limits.queueWaitMs),
      };

      this.bytes += cost;
      this.queue.push(job);
      signal.addEventListener('abort', job.abort, { once: true });

      if (signal.aborted) {
        job.abort();
      } else {
        this.pump();
      }
    });
  }

  private pump(): void {
    if (this.closed || this.active) {
      return;
    }

    const job = this.queue.shift();

    if (!job) {
      return;
    }
    this.active = job;
    clearTimeout(job.timer);
    job.timer = setTimeout(() => this.finish(job, undefined,
      new PublishedDataUnavailableError('Background document deadline exceeded')),
    Math.max(1, job.deadline - performance.now()));

    try {
      if (!this.worker) {
        const worker = new Worker(this.runner, {
          workerData: { registrations: this.registrations },
          resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 },
        });

        this.worker = worker;
        worker.on('message', (message: unknown) => {
          if (this.worker === worker) {
            try {
              this.message(message);
            } catch {
              if (this.active) {
                this.finish(this.active, undefined,
                  new PublishedDataUnavailableError('Invalid background channel response'));
              }
            }
          }
        });
        worker.on('error', () => {
          if (this.worker === worker && this.active) {
            this.finish(this.active, undefined, new PublishedDataUnavailableError('Background renderer failed'));
          }
        });
        worker.on('exit', () => {
          if (this.worker === worker) {
            this.worker = null;

            if (this.active) {
              this.finish(this.active, undefined, new PublishedDataUnavailableError('Background renderer exited'));
            }
          }
        });
      }
      this.worker.postMessage({ kind: RefreshMessageKind.Generate, jobId: job.id, input: job.input });
    } catch {
      this.finish(job, undefined, new PublishedDataUnavailableError('Background renderer could not start'));
    }
  }

  private message(value: unknown): void {
    const job = this.active;

    if (!job || job.finishing) {
      return;
    }

    const message = readRefreshMessage(value);

    if (message.jobId !== job.id) {
      return;
    }
    if (Buffer.byteLength(JSON.stringify(message)) > 8388608) {
      this.finish(job, undefined, new PublishedDataUnavailableError('Background result exceeded its limit'));

      return;
    }
    if (message.kind === RefreshMessageKind.Read) {
      this.bridge(job, message);
    } else if (message.kind === RefreshMessageKind.Result) {
      const document = readRefreshDocument(message.document);

      if (
        job.bridges.size
        || document.pageId !== job.input.stored.plan.pageId
        || document.releaseId !== job.input.stored.releaseId
      ) {
        this.finish(job, undefined, new PublishedDataUnavailableError('Invalid background document'));
      } else {
        this.finish(job, document);
      }
    } else {
      this.finish(job, undefined, new PublishedDataUnavailableError('Background document generation failed'));
    }
  }

  private bridge(job: IJob, message: Record<string, unknown>): void {
    const plan = job.input.stored.plan;
    const id = message.loaderId;
    const parameters = message.parameters;
    const required = message.required;

    if (
      ++job.calls > 2048
      || typeof id !== 'string'
      || !plan.snippetCachePolicies?.[id]
      || !Number.isSafeInteger(message.id)
      || typeof required !== 'boolean'
      || !isTemplateObject(parameters)
    ) {
      this.finish(job, undefined, new PublishedDataUnavailableError('Invalid background data request'));

      return;
    }

    let cacheable = true;
    const reply = (fields: Record<string, unknown>): void => {
      if (job.finishing || this.active !== job) {
        return;
      }

      const result = { kind: RefreshMessageKind.Reply, jobId: job.id, id: message.id, ...fields };

      if (Buffer.byteLength(JSON.stringify(result)) > 8388608) {
        throw new PublishedDataUnavailableError('Background data reply exceeded its limit');
      }
      this.worker!.postMessage(result);
    };
    const work = Promise.resolve().then(() => this.loaders.execute(id, parameters, {
      siteId: plan.siteId,
      pageId: plan.pageId,
      language: plan.page.language,
      phase: LoaderPhase.Request,
      preview: false,
      background: true,
      signal: job.cancellation.signal,
      execution: plan.snippetExecutions?.[id] ?? SnippetExecution.Sequential,
      cachePolicy: plan.snippetCachePolicies![id],
      publishedPages: plan.publishedPages ?? [],
      snippetSources: plan.templates,
      onUncacheable: () => {
        cacheable = false;
      },
    }, required)).then((value) => reply({ value, cacheable }), () => reply({ error: true }));

    job.bridges.add(work);
    void work.then(() => {
      job.bridges.delete(work);
    }, () => {
      job.bridges.delete(work);
      this.finish(job, undefined, new PublishedDataUnavailableError('Background data bridge failed'));
    });
  }

  private finish(job: IJob, document?: IPublishedDocument, error?: Error): void {
    if (job.finishing) {
      return;
    }
    job.finishing = true;
    clearTimeout(job.timer);
    job.signal.removeEventListener('abort', job.abort);

    if (error) {
      job.reject(error);
      job.cancellation.abort();
    }
    if (this.active !== job) {
      const index = this.queue.indexOf(job);

      if (index >= 0) {
        this.queue.splice(index, 1);
      }
      this.bytes -= job.cost;

      return;
    }

    const worker = error ? this.worker : null;

    if (worker) {
      this.worker = null;
    }

    const cleanup = Promise.allSettled([...(worker ? [worker.terminate()] : []), ...job.bridges]).then(() => {
      this.active = null;
      this.bytes -= job.cost;

      if (!error && document) {
        job.resolve(document);
      }
      this.cleanup.delete(cleanup);
      this.pump();
    });

    this.cleanup.add(cleanup);
  }

  snapshot(): { active: number; queued: number; bytes: number; refusals: number } {
    return { active: this.active ? 1 : 0, queued: this.queue.length, bytes: this.bytes, refusals: this.refusals };
  }

  async onModuleDestroy(): Promise<void> {
    this.closed = true;

    for (const job of [...this.queue]) {
      this.finish(job, undefined, new PublishedDataUnavailableError('Renderer closed'));
    }

    if (this.active) {
      this.finish(this.active, undefined, new PublishedDataUnavailableError('Renderer closed'));
    }

    const worker = this.worker;

    this.worker = null;

    if (worker) {
      await worker.terminate();
    }

    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      await Promise.race([Promise.allSettled([...this.cleanup]), new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 2000);
      })]);
    } finally {
      clearTimeout(timer);
    }
  }
}
