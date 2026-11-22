import type { EventEmitter } from 'node:events';

import { validateDumpCreation } from '../../../../domain/dumps/dump-selection.policy.js';
import {
  type IAddonDumpParts, type ISiteDump, type ISiteDumpCreation, SiteDumpType,
} from '../../../../domain/dumps/site-dump.js';
import { DumpExecutionMode } from '../../../../domain/resources/site-process-allocation.js';
import { BusinessError } from '../../../../domain/shared/business-error.js';
import type { IDumpCapacityLease } from '../../../../ports/outbound/resources/dump-capacity.port.js';

interface IRequester extends Pick<EventEmitter, 'on' | 'off' | 'once'> {
  readonly pid?: number | undefined;
  readonly connected: boolean;
  send(message: Record<string, unknown>, callback: (error: Error | null) => void): boolean;
  kill(signal: NodeJS.Signals): boolean;
}

interface IDumpCommand {
  readonly action: unknown;
  readonly options?: unknown;
}

interface IRequesterState {
  readonly siteId: string;
  readonly id: string;
  readonly worker: IRequester;
  readonly tasks: Set<Promise<void>>;
  readonly exited: Promise<void>;
  lease: IDumpCapacityLease | null;
  reserving: boolean;
  capture: { readonly id: string; readonly cancellation: AbortController } | null;
  disconnected: boolean;
  cleanup?: Promise<void>;
  terminationTimer?: ReturnType<typeof setTimeout>;
  removeListeners(): void;
}

import { DumpCoordinationAction, DumpCoordinationMessageKind } from './dump-coordination.protocol.js';

export class ProcessDumpCoordinator {
  private readonly requesters = new Set<IRequesterState>();
  private readonly failures: unknown[] = [];
  private closed = false;

  constructor(private readonly capacity: {
    reserveForProcess(siteId: string, owner: string): Promise<IDumpCapacityLease>;
  }, private readonly capture: (ownerPid: number, siteId: string, options: ISiteDumpCreation | undefined,
    signal: AbortSignal) => Promise<ISiteDump>,
  private readonly recoverRequester?: (ownerPid: number) => Promise<void>) {}

  attach(siteId: string, id: string, worker: IRequester): void {
    if (this.closed || !worker.pid) {
      throw new Error('Cannot attach a dump requester');
    }

    let markExited!: () => void;
    const exited = new Promise<void>((resolve) => {
      markExited = resolve;
    });
    const state: IRequesterState = {
      siteId,
      id,
      worker,
      exited,
      tasks: new Set(),
      lease: null,
      reserving: false,
      capture: null,
      disconnected: false,
      removeListeners: () => {
        clearTimeout(state.terminationTimer);
        worker.off('message', message);
        worker.off('exit', exit);
        worker.off('disconnect', disconnected);
      },
    };

    this.requesters.add(state);
    const disconnected = (): void => {
      if (!state.disconnected) {
        state.terminationTimer = setTimeout(() => worker.kill('SIGKILL'), 30000);
      }
      worker.kill('SIGTERM');
      void this.dispose(state, true).catch((error: unknown) => this.failures.push(error));
    };
    const exit = (): void => {
      clearTimeout(state.terminationTimer);
      markExited();
      disconnected();
    };
    const message = (value: unknown): void => {
      if (
        !value
        || typeof value !== 'object'
        || !('kind' in value)
        || !('id' in value)
        || typeof value.id !== 'string'
        || value.id.length > 64
      ) {
        return;
      }
      if (value.kind === DumpCoordinationMessageKind.Cancel) {
        if (state.capture?.id === value.id) {
          state.capture.cancellation.abort(new Error('Dump requester canceled capture'));
        }

        return;
      }
      if (value.kind !== DumpCoordinationMessageKind.Command || !('action' in value) || state.disconnected) {
        return;
      }

      const commandId = value.id;
      const reply = (result: Record<string, unknown>): void => {
        if (!state.disconnected && worker.connected) {
          worker.send({ kind: DumpCoordinationMessageKind.Result, id: commandId, ...result }, (error) => {
            if (error) {
              disconnected();
            }
          });
        }
      };
      const task = this.execute(state, commandId, value).then(reply, (error: unknown) => reply({
        error: 'Dump coordination failed',
        ...(error instanceof BusinessError ? { code: error.code } : {}),
      })).catch((error: unknown) => {
        this.failures.push(error);
        disconnected();
      });

      state.tasks.add(task);
      void task.then(() => state.tasks.delete(task));
    };

    worker.on('message', message);
    worker.once('exit', exit);
    worker.once('disconnect', disconnected);
  }

  private async execute(state: IRequesterState, id: string,
    command: IDumpCommand): Promise<Record<string, unknown>> {
    if (Buffer.byteLength(JSON.stringify(command)) > 2097152) {
      throw new Error('Dump IPC metadata exceeds its limit');
    }
    if (this.closed && command.action !== DumpCoordinationAction.Release) {
      throw new Error('CMS coordinator is draining');
    }
    if (command.action === DumpCoordinationAction.Reserve && !state.lease && !state.reserving) {
      state.reserving = true;

      try {
        const lease = await this.capacity.reserveForProcess(state.siteId, state.id);

        if (state.disconnected || this.closed) {
          await lease.release();
          throw new Error('Dump requester disconnected during admission');
        }
        state.lease = lease;

        return { mode: lease.mode };
      } finally {
        state.reserving = false;
      }
    }
    if (
      command.action === DumpCoordinationAction.Capture
      && state.lease
      && !state.capture
      && state.lease.mode !== DumpExecutionMode.InProcess
    ) {
      const options = 'options' in command ? this.options(command.options) : undefined;
      const cancellation = new AbortController();

      state.capture = { id, cancellation };

      try {
        const result = await this.capture(state.worker.pid!, state.siteId, options, cancellation.signal);

        return { result };
      } finally {
        state.capture = null;
      }
    }
    if (command.action === DumpCoordinationAction.Release && state.lease && !state.capture) {
      const lease = state.lease;

      state.lease = null;
      await lease.release();

      return {};
    }
    throw new Error('Invalid dump coordination command');
  }

  private options(value: unknown): ISiteDumpCreation {
    if (
      !value
      || typeof value !== 'object'
      || Array.isArray(value)
      || Buffer.byteLength(JSON.stringify(value)) > 2097152
      || !('type' in value)
    ) {
      throw new Error('Invalid dump options');
    }

    const type = Object.values(SiteDumpType).find((entry) => entry === value.type);

    if (!type) {
      throw new Error('Invalid dump type');
    }

    const itemIds = 'itemIds' in value ? value.itemIds : undefined;

    if (
      itemIds !== undefined
      && (!Array.isArray(itemIds)
      || !itemIds.every((entry: unknown): entry is string => typeof entry === 'string'))
    ) {
      throw new Error('Invalid dump item identities');
    }

    let addonParts: IAddonDumpParts | undefined;

    if ('addonParts' in value && value.addonParts !== undefined) {
      const parts = value.addonParts;

      if (
        !parts
        || typeof parts !== 'object'
        || !('configuration' in parts)
        || typeof parts.configuration !== 'boolean'
        || !('businessData' in parts)
        || typeof parts.businessData !== 'boolean'
        || !('package' in parts)
        || typeof parts.package !== 'boolean'
      ) {
        throw new Error('Invalid add-on dump options');
      }
      addonParts = {
        configuration: parts.configuration,
        businessData: parts.businessData,
        package: parts.package,
      };
    }

    const options: ISiteDumpCreation = {
      type,
      ...(Array.isArray(itemIds) ? {
        itemIds: itemIds.filter((entry: unknown): entry is string => typeof entry === 'string'),
      } : {}),
      ...(addonParts ? { addonParts } : {}),
    };

    validateDumpCreation(options);

    return options;
  }

  private dispose(state: IRequesterState, lost = false): Promise<void> {
    if (state.cleanup) {
      return state.cleanup;
    }
    state.disconnected = true;
    state.capture?.cancellation.abort(new Error('Dump requester disconnected'));
    state.cleanup = (async () => {
      await Promise.allSettled([...state.tasks]);
      const lease = state.lease;

      state.lease = null;

      try {
        try {
          if (lost && this.recoverRequester) {
            await state.exited;
            await this.recoverRequester(state.worker.pid!);
          }
        } finally {
          await lease?.release();
        }
      } finally {
        state.removeListeners();
        this.requesters.delete(state);
      }
    })();

    return state.cleanup;
  }

  async drain(): Promise<void> {
    this.closed = true;

    for (const state of this.requesters) {
      state.capture?.cancellation.abort(new Error('CMS coordinator is draining'));
    }
    await Promise.allSettled([...this.requesters].flatMap((state) => [...state.tasks]));
  }

  async close(): Promise<void> {
    await this.drain();
    const results = await Promise.allSettled([...this.requesters].map((state) => this.dispose(state)));
    const errors = [...this.failures,
      ...results.flatMap((result) => result.status === 'rejected' ? [result.reason] : [])];

    if (errors.length) {
      throw new AggregateError(errors, 'Dump coordination cleanup failed');
    }
  }
}
