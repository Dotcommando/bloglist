import { AsyncResource } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';

import { RenderStage, StageOutcome } from '../../../../domain/diagnostics/page-resolution.js';
import { type ITemplateObject, LoaderPhase, type TemplateValue } from '../../../../domain/pages/page-rendering.js';
import { PublishedDataUnavailableError } from '../../../../domain/publication/published-document.js';
import { BusinessError } from '../../../../domain/shared/business-error.js';
import type {
  IObservationInterval, IRenderObservationPort,
} from '../../../../ports/outbound/diagnostics/render-observation.port.js';
import type { ILoaderContext } from '../../../../ports/outbound/publication/data-loader.port.js';
import { snippetWorkerRunner } from './snippet-worker-runner.js';

export interface ISnippetPoolSettings {
  readonly size: number;
  readonly queueLimit: number;
  readonly queueWaitMs: number;
  readonly executionTimeoutMs: number;
  readonly memoryBudgetMb: number;
}

export function validateSnippetPoolSettings(input: Partial<ISnippetPoolSettings> = {}): ISnippetPoolSettings {
  const settings = {
    size: 4, queueLimit: 256, queueWaitMs: 1000, executionTimeoutMs: 10000, memoryBudgetMb: 512, ...input,
  };

  if (
    Object.values(settings).some((value) => !Number.isSafeInteger(value))
    || settings.size < 2
    || settings.size > 16
    || settings.queueLimit < 1
    || settings.queueLimit > 4096
    || settings.queueWaitMs < 1
    || settings.queueWaitMs > 10000
    || settings.executionTimeoutMs < 1
    || settings.executionTimeoutMs > 10000
    || settings.memoryBudgetMb < settings.size * 84 + 32
    || settings.memoryBudgetMb > 2048
  ) {
    throw new RangeError('Invalid Snippet pool limits or aggregate Worker memory budget');
  }

  return Object.freeze(settings);
}

interface IJob {
  readonly id: string;
  readonly scope: AsyncResource;
  readonly code: string;
  readonly data: string;
  readonly bytes: number;
  readonly context: ILoaderContext;
  readonly observation?: IRenderObservationPort | undefined;
  readonly resolve: (value: TemplateValue) => void;
  readonly reject: (error: Error) => void;
  readonly abort: () => void;
  readonly queueStage?: IObservationInterval | undefined;
  timer?: ReturnType<typeof setTimeout>;
  queueTimer?: ReturnType<typeof setTimeout>;
  startup?: IObservationInterval | undefined;
  script?: IObservationInterval | undefined;
  slot?: ISlot;
  settled: boolean;
  dispatched: boolean;
  started: boolean;
  pending: number;
  readonly calls: Set<number>;
}

interface ISlot {
  readonly worker: Worker;
  job?: IJob | undefined;
  retiring: boolean;
}

export class SnippetWorkerPool {
  readonly settings: ISnippetPoolSettings;
  private readonly slots = new Set<ISlot>();
  private readonly queue: IJob[] = [];
  private readonly terminations = new Set<Promise<void>>();
  private closed = false;
  private created = 0;
  private discarded = 0;
  private rejected = 0;
  private admittedBytes = 0;

  constructor(settings: Partial<ISnippetPoolSettings> = {}) {
    this.settings = validateSnippetPoolSettings(settings);
  }

  snapshot(): {
    workers: number; active: number; queued: number; created: number; discarded: number; rejected: number;
  } {
    return {
      workers: this.slots.size,
      active: [...this.slots].filter((slot) => slot.job).length,
      queued: this.queue.length,
      created: this.created,
      discarded: this.discarded,
      rejected: this.rejected,
    };
  }

  async execute(code: string, input: ITemplateObject, context: ILoaderContext,
    observation?: IRenderObservationPort): Promise<TemplateValue> {
    context.signal.throwIfAborted();

    if (this.closed) {
      throw new PublishedDataUnavailableError();
    }

    const data = JSON.stringify({
      input,
      context: {
        siteId: context.siteId,
        pageId: context.pageId,
        language: context.language,
        phase: context.phase,
        preview: context.preview,
        publishedPages: context.publishedPages ?? [],
      },
    });

    if (Buffer.byteLength(data) > 8388608 || Buffer.byteLength(code) > 2097152) {
      throw new Error('Snippet execution failed');
    }

    const bytes = Buffer.byteLength(data) + Buffer.byteLength(code);

    if (this.admittedBytes + bytes > 33554432) {
      this.rejected++;
      throw new PublishedDataUnavailableError();
    }
    this.admittedBytes += bytes;

    return new Promise((resolve, reject) => {
      const job: IJob = {
        id: randomUUID(),
        scope: new AsyncResource('SnippetInvocation'),
        code,
        data,
        bytes,
        context,
        observation,
        resolve,
        reject,
        settled: false,
        dispatched: false,
        started: false,
        pending: 0,
        calls: new Set(),
        abort: () => this.finish(job, undefined, false,
          context.signal.reason instanceof Error && context.signal.reason.name === 'TimeoutError'
            ? StageOutcome.Timeout : StageOutcome.Aborted),
        queueStage: observation?.start?.(RenderStage.WorkerQueue),
      };

      job.timer = setTimeout(() => this.finish(job, undefined, false, StageOutcome.Timeout),
        this.settings.executionTimeoutMs);
      context.signal.addEventListener('abort', job.abort, { once: true });

      const reservedPublicCapacity = this.isPublic(job) && (this.slots.size < this.settings.size
        || [...this.slots].some((slot) => !slot.job && !slot.retiring));

      if (this.queue.length >= this.settings.queueLimit && !reservedPublicCapacity) {
        this.rejected++;
        this.finish(job, undefined, false, StageOutcome.Failure, new PublishedDataUnavailableError());

        return;
      }
      this.queue.push(job);
      job.queueTimer = setTimeout(() => {
        this.rejected++;
        this.finish(job, undefined, false, StageOutcome.Timeout, new PublishedDataUnavailableError());
      }, this.settings.queueWaitMs);

      if (context.signal.aborted) {
        job.abort();
      } else {
        this.dispatch();
      }
    });
  }

  private dispatch(): void {
    if (this.closed) {
      return;
    }

    while (this.queue.length) {
      const background = [...this.slots].filter((slot) => slot.job && !this.isPublic(slot.job)).length;
      const index = this.queue.findIndex((job) => this.isPublic(job) || background < this.settings.size - 1);
      let slot = [...this.slots].find((value) => !value.job && !value.retiring);

      if (index < 0 || (!slot && this.slots.size >= this.settings.size)) {
        return;
      }

      const job = this.queue.splice(index, 1)[0]!;

      clearTimeout(job.queueTimer);
      job.queueStage?.finish();
      job.dispatched = true;
      job.startup = job.scope.runInAsyncScope(() => job.observation?.start?.(RenderStage.WorkerStartup));

      try {
        slot ??= this.create();
        slot.job = job;
        job.slot = slot;
        slot.worker.ref();
        slot.worker.postMessage({ kind: 'execute', jobId: job.id, code: job.code, data: job.data });
      } catch {
        this.finish(job);
      }
    }
  }

  private isPublic(job: IJob): boolean {
    return job.context.phase === LoaderPhase.Request && !job.context.preview && !job.context.background;
  }

  private create(): ISlot {
    const worker = new Worker(snippetWorkerRunner, {
      eval: true,
      execArgv: [],
      env: {},
      resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 },
    });
    const slot: ISlot = { worker, retiring: false };

    this.slots.add(slot);
    this.created++;
    worker.on('message', (message: unknown) => {
      const job = slot.job;

      job?.scope.runInAsyncScope(() => this.message(slot, message));
    });
    worker.on('error', () => this.fault(slot));
    worker.on('exit', () => this.fault(slot));
    worker.unref();

    return slot;
  }

  private message(slot: ISlot, value: unknown): void {
    const job = slot.job;

    if (slot.retiring || !job || job.settled) {
      return;
    }
    if (!value || typeof value !== 'object' || !('jobId' in value) || value.jobId !== job.id || !('kind' in value)) {
      this.finish(job);

      return;
    }
    if (value.kind === 'started' && !job.started) {
      job.started = true;
      job.startup?.finish();
      job.startup = undefined;
      job.script = job.observation?.start?.(RenderStage.Script);
    } else if (value.kind === 'result' && job.started && 'value' in value && typeof value.value === 'string') {
      if (job.pending > 0 || !('cacheable' in value) || value.cacheable !== true) {
        job.context.onUncacheable?.();
      }
      this.finish(job, value.value, 'reusable' in value && value.reusable === true && job.pending === 0);
    } else if (
      value.kind === 'bridge'
      && job.started
      && 'id' in value
      && typeof value.id === 'number'
      && Number.isSafeInteger(value.id)
      && value.id > 0
      && !job.calls.has(value.id)
      && job.calls.size < 2048
      && 'path' in value
      && 'input' in value
    ) {
      job.calls.add(value.id);
      this.bridge(job, value.id, value.path, value.input);
    } else {
      this.finish(job);
    }
  }

  private bridge(job: IJob, id: number, path: unknown, input: unknown): void {
    job.pending++;
    const invoke = async (): Promise<unknown> => {
      if (
        !(Array.isArray(path) && [2, 4].includes(path.length)
        && path.every((part: unknown) => typeof part === 'string'
          && !['__proto__', 'constructor', 'prototype'].includes(part)))
      ) {
        throw new Error('Invalid CMS operation path');
      }

      let target: unknown = job.context.cms;

      for (const part of path) {
        if (target === null || typeof target !== 'object' || !Object.hasOwn(target, part)) {
          throw new Error('CMS operation unavailable');
        }
        target = Object.getOwnPropertyDescriptor(target, part)?.value;
      }

      if (typeof target !== 'function') {
        throw new Error('CMS operation unavailable');
      }

      return target(input ?? {});
    };
    const reply = (message: { readonly value?: unknown;
      readonly failed?: boolean;
      readonly code?: string;
      readonly message?: string }): void => {
      job.pending--;

      if (job.settled || job.context.signal.aborted || job.slot?.job !== job) {
        return;
      }

      try {
        const payload = JSON.stringify(message);

        if (Buffer.byteLength(payload) > 8388608) {
          throw new Error('Invalid CMS response');
        }
        job.slot.worker.postMessage({ ...message, kind: 'reply', jobId: job.id, id });
      } catch {
        this.finish(job);
      }
    };

    void (job.observation?.measure(RenderStage.Bridge, invoke) ?? invoke()).then((value) => reply({ value }),
      (error: unknown) => {
        job.context.onUncacheable?.();
        reply({
          failed: true,
          code: error instanceof BusinessError ? error.code : 'Unavailable',
          message: error instanceof BusinessError ? error.message : 'CMS operation failed',
        });
      });
  }

  private finish(job: IJob, value?: string, reusable = false, outcome?: StageOutcome, error?: Error): void {
    job.scope.runInAsyncScope(() => this.settle(job, value, reusable, outcome, error));
  }

  private settle(job: IJob, value?: string, reusable = false, outcome = value === undefined
    ? StageOutcome.Failure : StageOutcome.Success, error: Error = new Error('Snippet execution failed')): void {
    if (job.settled) {
      return;
    }
    job.settled = true;
    this.admittedBytes -= job.bytes;
    clearTimeout(job.timer);
    clearTimeout(job.queueTimer);
    job.context.signal.removeEventListener('abort', job.abort);
    const index = this.queue.indexOf(job);

    if (index >= 0) {
      this.queue.splice(index, 1);
    }
    if (!job.dispatched) {
      job.queueStage?.finish(outcome);
    }
    job.startup?.finish(outcome);
    job.script?.finish(outcome);
    let result: TemplateValue | undefined;

    if (value !== undefined) {
      try {
        if (Buffer.byteLength(value) > 2097152) {
          throw error;
        }

        const decode = (): TemplateValue => JSON.parse(value);

        result = job.observation ? job.observation.sync(RenderStage.Transfer, decode) : decode();
      } catch {
        reusable = false;
      }
    }
    if (job.slot) {
      job.slot.job = undefined;

      if (reusable && result !== undefined && !this.closed) {
        const cleanup = (): void => {
          job.slot!.worker.unref();
        };

        if (job.observation) {
          job.observation.sync(RenderStage.Cleanup, cleanup);
        } else {
          cleanup();
        }
      } else {
        this.retire(job.slot, job.observation);
      }
    }
    if (result === undefined) {
      job.reject(error);
    } else {
      job.resolve(result);
    }
    job.scope.emitDestroy();
    this.dispatch();
  }

  private fault(slot: ISlot): void {
    if (slot.retiring) {
      return;
    }
    if (slot.job) {
      this.finish(slot.job);
    } else {
      this.retire(slot);
    }
  }

  private retire(slot: ISlot, observation?: IRenderObservationPort): void {
    if (slot.retiring) {
      return;
    }
    slot.retiring = true;
    this.discarded++;
    const terminate = async (): Promise<void> => {
      await slot.worker.terminate();
    };
    const pending = (observation?.measure(RenderStage.Cleanup, terminate) ?? terminate())
      .catch(() => {}).finally(() => {
        this.slots.delete(slot);
        this.terminations.delete(pending);
        this.dispatch();
      });

    this.terminations.add(pending);
  }

  async onModuleDestroy(): Promise<void> {
    this.closed = true;

    for (const job of [...this.queue, ...[...this.slots].flatMap((slot) => slot.job ? [slot.job] : [])]) {
      this.finish(job, undefined, false, StageOutcome.Aborted);
    }

    for (const slot of this.slots) {
      this.retire(slot);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      await Promise.race([
        Promise.all([...this.terminations]),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, 2000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}
