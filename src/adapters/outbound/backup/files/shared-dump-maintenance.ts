import { randomUUID } from 'node:crypto';
import {
  existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync,
  unlinkSync, writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { BusinessError, BusinessErrorCode } from '../../../../domain/shared/business-error.js';
import { captureProcessAlive } from './dump-capture-lease.js';
import { DumpMaintenance } from './dump-maintenance.js';

interface ISharedGateState {
  readonly version: string;
  readonly owner: number | null;
  readonly readable: boolean;
  readonly failed: boolean;
}

function parseSharedState(state: unknown): ISharedGateState {
  if (
    !state
    || typeof state !== 'object'
    || !('version' in state)
    || typeof state.version !== 'string'
    || !('owner' in state)
    || !(state.owner === null
      || typeof state.owner === 'number' && Number.isSafeInteger(state.owner) && state.owner > 0)
    || !('readable' in state)
    || typeof state.readable !== 'boolean'
    || !('failed' in state)
    || typeof state.failed !== 'boolean'
  ) {
    throw new Error('Invalid shared maintenance state');
  }

  return { version: state.version, owner: state.owner, readable: state.readable, failed: state.failed };
}

/** Local installation processes share private filesystem admission, never a network filesystem. */
export class SharedDumpMaintenance extends DumpMaintenance {
  private readonly statePath: string;
  private readonly mutexPath: string;
  private readonly ticketsPath: string;
  private observedVersion: string | null = null;
  private readonly mutationPath: string;

  constructor(root: string, private readonly clearCaches?: () => void) {
    super();
    mkdirSync(root, { recursive: true, mode: 0o700 });

    if (!lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) {
      throw new Error('Invalid shared maintenance root');
    }
    this.statePath = path.join(root, 'state.json');
    this.mutationPath = path.join(root, 'mutation');
    this.mutexPath = path.join(root, 'mutex');
    this.ticketsPath = path.join(root, 'active');
    mkdirSync(this.ticketsPath, { recursive: true, mode: 0o700 });
    this.locked(() => {
      if (!existsSync(this.statePath)) {
        this.save({ version: randomUUID(), owner: null, readable: false, failed: false });
      }
    });
  }

  override get captureActive(): boolean {
    const state = this.read();

    return state.owner !== null && state.readable;
  }

  override enter(readOnly = false, invalidateOnRelease = true): () => void {
    // Register before observing the gate: a concurrent drain must see this admission or reject it.
    const ticket = path.join(this.ticketsPath, `${process.pid}-${randomUUID()}`);

    writeFileSync(ticket, '', { flag: 'wx', mode: 0o600 });

    try {
      const state = this.read();

      if (state.failed || state.owner !== null && !(readOnly && state.readable)) {
        throw this.conflict();
      }
      this.observe(state);
    } catch (error) {
      unlinkSync(ticket);
      throw error;
    }
    let released = false;

    return () => {
      if (!released) {
        released = true;

        if (!readOnly && invalidateOnRelease) {
          this.notifyMutation();
        }
        unlinkSync(ticket);
      }
    };
  }

  override failClosed(): void {
    this.locked(() => this.save({ ...this.read(), version: randomUUID(), failed: true }));
  }

  override async run<T>(action: () => Promise<T>, allowReads = false): Promise<T> {
    this.locked(() => {
      const state = this.read();

      if (state.failed || state.owner !== null) {
        throw this.conflict();
      }
      this.save({ ...state, version: randomUUID(), owner: process.pid, readable: false });
    });
    const deadline = performance.now() + 30000;

    try {
      while (!this.locked(() => this.allAdmissionsDrained())) {
        if (performance.now() >= deadline) {
          throw new BusinessError(BusinessErrorCode.Conflict, 'Active requests did not drain');
        }
        await delay(10);
      }
      this.locked(() => {
        const state = { ...this.read(), readable: allowReads };

        this.save(state);
        this.observe(state);
      });

      return await action();
    } finally {
      await this.waitForStateLock(() => {
        const state = this.read();
        const next = { ...state, version: randomUUID(), owner: null, readable: false };

        this.save(next);
        this.observe(next);
      });
    }
  }

  async recoverCaptureOwner(ownerPid: number, cleanup: () => Promise<void>): Promise<void> {
    if (captureProcessAlive(ownerPid)) {
      throw new Error('A live capture owner cannot be recovered');
    }

    let owned = false;

    await this.waitForStateLock(() => {
      const state = this.read();

      if (state.owner !== ownerPid) {
        return;
      }
      if (!state.readable || state.failed) {
        throw new Error('Uncertain maintenance operation requires installation recovery');
      }
      owned = true;
      this.save({ ...state, version: randomUUID(), readable: false });
    });

    if (!owned) {
      return;
    }

    try {
      await cleanup();
      await this.waitForStateLock(() => {
        const state = this.read();

        if (state.owner !== ownerPid || state.failed) {
          throw new Error('Maintenance ownership changed during recovery');
        }
        this.save({ ...state, version: randomUUID(), owner: null, readable: false });
      });
    } catch (error) {
      this.failClosed();
      throw error;
    }
  }

  private allAdmissionsDrained(): boolean {
    for (const entry of readdirSync(this.ticketsPath)) {
      if (!/^\d+-[a-f0-9-]+$/.test(entry)) {
        throw new Error('Invalid maintenance admission');
      }

      const pid = Number(entry.slice(0, entry.indexOf('-')));

      try {
        process.kill(pid, 0);

        return false;
      } catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'ESRCH') {
          throw error;
        }
        unlinkSync(path.join(this.ticketsPath, entry));
      }
    }

    return true;
  }

  generation(): string {
    const state = this.read();
    const mutation = existsSync(this.mutationPath) ? readFileSync(this.mutationPath, 'utf8') : '';

    return state.version + mutation;
  }

  notifyMutation(): void {
    const temporary = this.mutationPath + '.' + randomUUID();

    writeFileSync(temporary, randomUUID(), { flag: 'wx', mode: 0o600 });
    renameSync(temporary, this.mutationPath);
  }

  private observe(state: ISharedGateState): void {
    const mutation = existsSync(this.mutationPath) ? readFileSync(this.mutationPath, 'utf8') : '';
    const version = state.version + mutation;

    if (this.observedVersion !== version) {
      this.clearCaches?.();
      this.observedVersion = version;
    }
  }

  /** Called only before opening installation listeners, after the old supervisor and admissions have exited. */
  static recoverQuiescent(root: string): void {
    const active = path.join(root, 'active');

    if (existsSync(active)) {
      for (const entry of readdirSync(active)) {
        const pid = Number(entry.split('-')[0]);

        if (!Number.isSafeInteger(pid) || pid <= 0) {
          throw new Error('Invalid maintenance admission');
        }

        try {
          process.kill(pid, 0);
          throw new Error('Another installation process is still active');
        } catch (error) {
          if (!(error instanceof Error) || !('code' in error) || error.code !== 'ESRCH') {
            throw error;
          }
        }
        unlinkSync(path.join(active, entry));
      }
    }

    const statePath = path.join(root, 'state.json');

    if (existsSync(statePath)) {
      const state = parseSharedState(JSON.parse(readFileSync(statePath, 'utf8')));

      if (state.owner !== null) {
        try {
          process.kill(state.owner, 0);
          throw new Error('A maintenance owner is still active');
        } catch (error) {
          if (!(error instanceof Error) || !('code' in error) || error.code !== 'ESRCH') {
            throw error;
          }
        }
      }
      unlinkSync(statePath);
    }

    const mutex = path.join(root, 'mutex');

    if (existsSync(mutex)) {
      if (lstatSync(mutex).isSymbolicLink()) {
        throw new Error('Invalid maintenance mutex');
      }
      rmdirSync(mutex);
    }
  }

  private read(): ISharedGateState {
    return parseSharedState(JSON.parse(readFileSync(this.statePath, 'utf8')));
  }

  private save(state: ISharedGateState): void {
    const temporary = this.statePath + '.' + randomUUID();

    writeFileSync(temporary, JSON.stringify(state), { flag: 'wx', mode: 0o600 });
    renameSync(temporary, this.statePath);
  }

  private locked<T>(action: () => T): T {
    try {
      mkdirSync(this.mutexPath, { mode: 0o700 });
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
        throw this.conflict();
      }
      throw error;
    }

    try {
      return action();
    } finally {
      rmdirSync(this.mutexPath);
    }
  }

  private conflict(): BusinessError {
    return new BusinessError(BusinessErrorCode.Conflict, 'Installation maintenance in progress');
  }

  private async waitForStateLock(action: () => void): Promise<void> {
    const deadline = performance.now() + 30000;

    while (true) {
      try {
        this.locked(action);

        return;
      } catch (error) {
        if (
          !(error instanceof BusinessError)
          || error.code !== BusinessErrorCode.Conflict
          || performance.now() >= deadline
        ) {
          throw error;
        }
        await delay(1);
      }
    }
  }
}
