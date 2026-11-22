import { PublishedDataUnavailableError } from '../../../domain/publication/published-document.js';
import { SnippetExecution } from '../../../domain/rendering/snippet.js';
import { orderSnippetExecution } from '../../../domain/rendering/snippet-execution.policy.js';
import type { ISnippetExecutionTask } from '../../../ports/outbound/publication/template-composition.port.js';
import { SnippetAdmissionService } from './snippet-admission.service.js';

export interface ISnippetConcurrencySettings {
  readonly perRender: number;
  readonly perProcess: number;
  readonly queueLimit: number;
  readonly queueWaitMs: number;
}

export function validateSnippetConcurrencySettings(input: Partial<ISnippetConcurrencySettings> = {}):
ISnippetConcurrencySettings {
  const settings = { perRender: 4, perProcess: 16, queueLimit: 256, queueWaitMs: 10000, ...input };

  if (
    Object.values(settings).some((value) => !Number.isSafeInteger(value))
    || settings.perRender < 1
    || settings.perRender > 16
    || settings.perProcess < settings.perRender
    || settings.perProcess > 64
    || settings.queueLimit < 1
    || settings.queueLimit > 4096
    || settings.queueWaitMs < 1
    || settings.queueWaitMs > 10000
  ) {
    throw new RangeError('Invalid Snippet concurrency limits');
  }

  return Object.freeze(settings);
}

export interface ISnippetSchedulingSession {
  execute(tasks: readonly ISnippetExecutionTask[], signal: AbortSignal): Promise<void>;
  scopes(tasks: readonly ISnippetExecutionTask[], signal: AbortSignal): Promise<void>;
}

export class SnippetSchedulerService {
  readonly settings: ISnippetConcurrencySettings;
  private readonly admission: SnippetAdmissionService;
  private readonly controllers = new Set<AbortController>();
  private closed = false;

  constructor(settings: Partial<ISnippetConcurrencySettings> = {}) {
    this.settings = validateSnippetConcurrencySettings(settings);
    this.admission = new SnippetAdmissionService(this.settings.perProcess,
      this.settings.queueLimit, this.settings.queueWaitMs);
  }

  snapshot(): { active: number; queued: number } {
    return this.admission.snapshot();
  }

  createSession(): ISnippetSchedulingSession {
    const budget = new SnippetAdmissionService(this.settings.perRender,
      this.settings.queueLimit, this.settings.queueWaitMs);

    return {
      execute: (tasks, signal) => this.run(tasks, signal, budget, true),
      scopes: (tasks, signal) => this.run(tasks, signal, budget, false),
    };
  }

  execute(tasks: readonly ISnippetExecutionTask[], cancellation: AbortSignal): Promise<void> {
    return this.createSession().execute(tasks, cancellation);
  }

  private async run(tasks: readonly ISnippetExecutionTask[], cancellation: AbortSignal,
    budget: SnippetAdmissionService, read: boolean): Promise<void> {
    const ordered = orderSnippetExecution(tasks);
    const controller = new AbortController();
    const signal = AbortSignal.any([cancellation, controller.signal]);
    const completed = new Set<string>();
    let segment: ISnippetExecutionTask[] = [];

    if (this.closed) {
      throw new PublishedDataUnavailableError();
    }
    this.controllers.add(controller);
    const group = async (): Promise<void> => {
      const pending = new Map(segment.map((task) => [task.id, task]));
      const waiters = new Set<() => void>();
      const wake = (): void => {
        for (const waiter of waiters) {
          waiter();
        }
        waiters.clear();
      };
      const work = async (): Promise<void> => {
        while (pending.size) {
          signal.throwIfAborted();
          const ready = [...pending.values()].find((task) => task.dependsOn.every((id) => completed.has(id)));

          if (!ready) {
            await new Promise<void>((resolve) => {
              waiters.add(resolve);
            });
            continue;
          }
          pending.delete(ready.id);
          let release: (() => void) | undefined;

          try {
            if (read) {
              const localRelease = await budget.acquire(signal);

              try {
                const globalRelease = await this.admission.acquire(signal);

                release = () => {
                  globalRelease();
                  localRelease();
                };
              } catch (error) {
                localRelease();
                throw error;
              }
            }
            signal.throwIfAborted();
            await ready.run(signal);
            completed.add(ready.id);
          } catch (error) {
            controller.abort(error);
            throw error;
          } finally {
            release?.();
            wake();
          }
        }
      };

      signal.addEventListener('abort', wake, { once: true });

      try {
        await Promise.all(Array.from({ length: Math.min(this.settings.perRender, segment.length) }, work));
      } finally {
        signal.removeEventListener('abort', wake);
      }
      segment = [];
    };

    try {
      for (const task of ordered) {
        signal.throwIfAborted();

        if (task.execution === SnippetExecution.ParallelRead) {
          segment.push(task);
        } else {
          await group();
          await task.run(signal);
          completed.add(task.id);
        }
      }
      await group();
    } catch (error) {
      controller.abort(error);
      throw error;
    } finally {
      this.controllers.delete(controller);
    }
  }

  onModuleDestroy(): void {
    this.closed = true;
    const error = new PublishedDataUnavailableError();

    for (const controller of this.controllers) {
      controller.abort(error);
    }

    this.admission.close();
  }
}
