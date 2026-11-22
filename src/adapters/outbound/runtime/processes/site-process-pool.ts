import { randomUUID } from 'node:crypto';
import type { EventEmitter } from 'node:events';

import { InstallationProcessState } from '../../../../domain/resources/installation-process.js';
import { BusinessError, BusinessErrorCode } from '../../../../domain/shared/business-error.js';

export interface IManagedChild extends EventEmitter {
  readonly pid?: number | undefined;
  send(message: { readonly kind: string;
    readonly durationMs?: number;
    readonly addonKey?: string;
    readonly deadlineAt?: string }): boolean;
  kill(signal?: NodeJS.Signals): boolean;
}

export interface IServingProcess {
  readonly id: string;
  readonly siteId: string;
  readonly databasePoolSize: number;
  readonly child: IManagedChild;
  port: number;
  ready: boolean;
  retiring: boolean;
  exited: boolean;
}

export class SiteProcessPool {
  private readonly workers: IServingProcess[] = [];
  private readonly stops = new WeakMap<IServingProcess, Promise<void>>();
  private databasePoolSize = 5;
  private readonly desired = new Map<string, number>();
  private readonly errors = new Map<string, string>();
  private readonly turns = new Map<string, number>();
  private readonly lent = new Set<string>();
  private readonly resizing = new Set<string>();
  private readonly replacements = new Set<Promise<void>>();
  private closed = false;
  private readonly recovering = new Set<string>();
  private readonly cancelRecovery = new Set<() => void>();

  constructor(private readonly spawn: (siteId: string, id: string, databasePoolSize: number) => IManagedChild,
    private readonly timeoutMs = 30000) {}

  snapshot(): readonly { readonly pid: number | null;
    readonly siteId: string;
    readonly state: InstallationProcessState }[] {
    return this.workers.filter(worker => !worker.exited).map(worker => ({
      pid: worker.child.pid ?? null,
      siteId: worker.siteId,
      state: worker.retiring ? InstallationProcessState.Draining
        : worker.ready ? InstallationProcessState.Ready : InstallationProcessState.Starting,
    }));
  }

  running(siteId: string): number {
    return this.members(siteId).length;
  }

  failure(siteId: string): string | null {
    return this.errors.get(siteId) ?? null;
  }

  private readonly admissions = new Map<IServingProcess, number>();
  private readonly drains = new Map<IServingProcess, () => void>();

  acquire(siteId: string): { readonly worker: IServingProcess; release(): void } {
    const worker = this.select(siteId);

    this.admissions.set(worker, (this.admissions.get(worker) ?? 0) + 1);
    let released = false;

    return {
      worker,
      release: () => {
        if (released) {
          return;
        }
        released = true;
        const remaining = (this.admissions.get(worker) ?? 1) - 1;

        if (remaining) {
          this.admissions.set(worker, remaining);
        } else {
          this.admissions.delete(worker);
          const drain = this.drains.get(worker);

          this.drains.delete(worker);
          drain?.();
        }
      },
    };
  }

  select(siteId: string): IServingProcess {
    const workers = this.members(siteId);

    if (!workers.length) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Site has no ready serving process');
    }

    const turn = this.turns.get(siteId) ?? 0;

    this.turns.set(siteId, (turn + 1) % workers.length);

    return workers[turn % workers.length]!;
  }

  async restart(siteId: string, addonKey: string): Promise<{ readonly forcedProcessIds: readonly string[] }> {
    if (
      this.closed
      || !/^[a-z][a-z0-9-]{0,63}$/.test(addonKey)
      || this.lent.has(siteId)
      || this.resizing.has(siteId)
      || this.recovering.has(siteId)
    ) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Site allocation is unavailable');
    }

    const previous = this.members(siteId);
    const forcedProcessIds: string[] = [];

    if (!previous.length) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Site has no ready serving process');
    }
    this.resizing.add(siteId);

    try {
      for (const worker of previous) {
        await this.start(siteId);
        await this.stop(worker, {
          addonKey,
          forced: () => forcedProcessIds.push(worker.id),
        });
      }
      this.errors.delete(siteId);

      return { forcedProcessIds };
    } finally {
      this.resizing.delete(siteId);
    }
  }

  async resize(siteId: string, count: number): Promise<void> {
    if (
      this.closed
      || !Number.isSafeInteger(count)
      || count < 1
      || this.lent.has(siteId)
      || this.resizing.has(siteId)
    ) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Site allocation is unavailable');
    }
    this.desired.set(siteId, count);
    this.errors.delete(siteId);

    this.resizing.add(siteId);

    try {
      while (this.running(siteId) > count) {
        await this.stop(this.members(siteId).at(-1)!);
      }

      while (this.running(siteId) < count) {
        await this.start(siteId);
      }
    } finally {
      this.resizing.delete(siteId);
    }
  }

  hasDatabasePoolSize(size: number): boolean {
    return [...this.desired].every(([siteId, count]) => this.running(siteId) === count
      && this.members(siteId).every((worker) => worker.databasePoolSize === size));
  }

  async configureDatabasePoolSize(size: number): Promise<void> {
    if (
      this.closed
      || !Number.isSafeInteger(size)
      || size < 1
      || this.lent.size
      || this.resizing.size
    ) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Database pool configuration is unavailable');
    }
    this.databasePoolSize = size;

    for (const [siteId] of this.desired) {
      this.resizing.add(siteId);

      try {
        for (const old of this.members(siteId).filter((worker) => worker.databasePoolSize !== size)) {
          await this.start(siteId);
          await this.stop(old);
        }

        while (this.running(siteId) < (this.desired.get(siteId) ?? 0)) {
          await this.start(siteId);
        }
        this.errors.delete(siteId);
      } catch (error) {
        this.errors.set(siteId, 'Database pool reconfiguration is incomplete');
        throw error;
      } finally {
        this.resizing.delete(siteId);
      }
    }
  }

  async lend(siteId: string, requestOwner: string): Promise<() => Promise<void>> {
    const worker = this.members(siteId).find((entry) => entry.id !== requestOwner);

    if (!worker || this.running(siteId) < 2 || this.lent.has(siteId)) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Site cannot lend a serving process');
    }
    this.lent.add(siteId);

    try {
      await this.stop(worker);
    } catch (error) {
      this.lent.delete(siteId);
      throw error;
    }
    let restored = false;

    return async () => {
      if (restored) {
        return;
      }
      restored = true;

      try {
        while (!this.closed && this.running(siteId) < (this.desired.get(siteId) ?? 1)) {
          await this.start(siteId);
        }
      } finally {
        this.lent.delete(siteId);
      }
    };
  }

  beginShutdown(): void {
    this.closed = true;

    for (const cancel of this.cancelRecovery) {
      cancel();
    }
  }

  async close(): Promise<void> {
    this.beginShutdown();
    await Promise.allSettled([...this.replacements]);
    const results = await Promise.allSettled(this.workers.filter((entry) => !entry.exited)
      .map((entry) => this.stop(entry)));
    const failures = results.filter((entry) => entry.status === 'rejected');

    if (failures.length) {
      throw new AggregateError(failures.map((entry) => entry.reason), 'Serving processes did not shut down cleanly');
    }
  }

  private members(siteId: string): IServingProcess[] {
    return this.workers.filter((entry) => entry.siteId === siteId && entry.ready && !entry.retiring && !entry.exited);
  }

  private async start(siteId: string): Promise<void> {
    if (this.closed) {
      throw new Error('Serving pool is closed');
    }

    const id = randomUUID();
    let child: IManagedChild;

    try {
      child = this.spawn(siteId, id, this.databasePoolSize);
    } catch (error) {
      this.errors.set(siteId, 'Serving process could not start');
      throw error;
    }
    const worker: IServingProcess = {
      id,
      siteId,
      child,
      databasePoolSize: this.databasePoolSize,
      port: 0,
      ready: false,
      retiring: false,
      exited: false,
    };

    this.workers.push(worker);
    const failure = (): void => {
      this.errors.set(siteId, 'Serving process failed');
    };

    child.on('error', failure);
    child.once('exit', () => {
      const wasReady = worker.ready;

      worker.exited = true;
      worker.ready = false;
      child.off('error', failure);
      this.workers.splice(this.workers.indexOf(worker), 1);

      if (wasReady && !worker.retiring && !this.closed) {
        this.errors.set(siteId, 'Serving process exited');

        // One observed replacement attempt; repeated initialization failure remains visibly degraded.
        if (
          !this.lent.has(siteId)
          && !this.resizing.has(siteId)
          && !this.recovering.has(siteId)
          && this.running(siteId) < (this.desired.get(siteId) ?? 0)
        ) {
          this.recovering.add(siteId);
          const replacement = (async () => {
            try {
              while (!this.closed && !this.lent.has(siteId) && !this.resizing.has(siteId)
                && this.running(siteId) < (this.desired.get(siteId) ?? 0)) {
                await new Promise<void>((resolve) => {
                  const finish = (): void => {
                    clearTimeout(timer);
                    this.cancelRecovery.delete(finish);
                    resolve();
                  };
                  const timer = setTimeout(finish, 1000);

                  this.cancelRecovery.add(finish);
                });

                if (
                  !this.closed
                  && !this.lent.has(siteId)
                  && !this.resizing.has(siteId)
                  && this.running(siteId) < (this.desired.get(siteId) ?? 0)
                ) {
                  await this.start(siteId);
                }
              }

              if (this.running(siteId) >= (this.desired.get(siteId) ?? 0)) {
                this.errors.delete(siteId);
              }
            } catch {
              this.errors.set(siteId, 'Serving process replacement failed');
            } finally {
              this.recovering.delete(siteId);
            }
          })();

          this.replacements.add(replacement);
          void replacement.then(() => this.replacements.delete(replacement));
        }
      }
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const finish = (error?: Error): void => {
          clearTimeout(timer);
          child.off('message', message);
          child.off('error', failure);
          child.off('exit', exit);

          if (error) {
            reject(error);
          } else {
            resolve();
          }
        };
        const message = (value: unknown): void => {
          if (
            value
            && typeof value === 'object'
            && 'kind' in value
            && value.kind === 'ready'
            && 'port' in value
            && typeof value.port === 'number'
            && Number.isInteger(value.port)
            && value.port > 0
            && value.port <= 65535
          ) {
            if (this.closed || worker.retiring || worker.exited) {
              finish(new Error('Serving pool stopped during initialization'));

              return;
            }
            if ('databasePoolSize' in value && value.databasePoolSize !== worker.databasePoolSize) {
              finish(new Error('Serving process database pool differs from its requested configuration'));

              return;
            }
            worker.port = value.port;
            worker.ready = true;
            finish();
          }
        };
        const failure = (): void => finish(new Error('Serving process initialization failed'));
        const exit = (): void => finish(new Error('Serving process exited before readiness'));
        const timer = setTimeout(failure, this.timeoutMs);

        child.on('message', message);
        child.once('error', failure);
        child.once('exit', exit);
      });
    } catch (error) {
      this.errors.set(siteId, 'Serving process initialization failed');
      await this.stop(worker);
      throw error;
    }
  }

  private stop(worker: IServingProcess, update?: {
    readonly addonKey: string;
    readonly forced: () => void;
  }): Promise<void> {
    const pending = this.stops.get(worker);

    if (pending) {
      return pending;
    }
    worker.retiring = true;
    worker.ready = false;

    if (worker.exited) {
      return Promise.resolve();
    }

    const stopping = new Promise<void>((resolve, reject) => {
      let expired = false;
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      const finish = (): void => {
        clearTimeout(timer);
        clearTimeout(killTimer);
        this.drains.delete(worker);
        worker.child.off('exit', finish);

        if (expired && !update) {
          reject(new Error('Serving process drain deadline exceeded'));
        } else {
          resolve();
        }
      };
      const durationMs = update ? 20000 : this.timeoutMs;
      const deadlineAt = new Date(Date.now() + durationMs).toISOString();
      const timer = setTimeout(() => {
        expired = true;
        this.drains.delete(worker);
        update?.forced();
        killTimer = setTimeout(() => {
          worker.child.off('exit', finish);
          reject(new Error('Serving process did not exit after forced termination'));
        }, 2000);

        try {
          worker.child.kill('SIGKILL');
        } catch (error) {
          clearTimeout(killTimer);
          worker.child.off('exit', finish);
          reject(error);
        }
      }, durationMs);

      worker.child.once('exit', finish);

      const send = (kind: string): void => {
        if (worker.exited) {
          return;
        }

        try {
          worker.child.send({ kind, ...(update ? { addonKey: update.addonKey, deadlineAt } : {}) });
        } catch (error) {
          try {
            worker.child.kill('SIGTERM');
          } catch (killError) {
            clearTimeout(timer);
            this.drains.delete(worker);
            worker.child.off('exit', finish);
            reject(new AggregateError([error, killError], 'Serving process could not stop'));
          }
        }
      };

      if (update) {
        send('prepare-update');
      }
      if (this.admissions.get(worker)) {
        this.drains.set(worker, () => send('drain'));
      } else {
        send('drain');
      }
    });

    this.stops.set(worker, stopping);

    return stopping;
  }
}
