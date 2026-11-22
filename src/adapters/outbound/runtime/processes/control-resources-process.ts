import { randomUUID } from 'node:crypto';
import type { EventEmitter } from 'node:events';

import type { ICalibrationConfiguration } from '../../../../domain/calibration/calibration-run.js';
import type { IInstallationResourceState } from '../../../../domain/resources/installation-resources.js';
import { BusinessError, BusinessErrorCode } from '../../../../domain/shared/business-error.js';
import type { ICalibrationResourceLease } from '../../../../ports/outbound/calibration/calibration-runtime.port.js';
import type { IInstallationResourcesPort, IResourceChange }
  from '../../../../ports/outbound/resources/installation-resources.port.js';
import {
  readControlCalibrationConfiguration,
  readControlCalibrationLease, readControlResourceChange, readControlResourceState, readControlResourceVoid,
} from './control-resources-codec.js';

export enum ControlResourceMessageKind {
  Command = 'ControlResourceCommand',
  Result = 'ControlResourceResult',
}

export interface IControlResourceMessage {
  readonly kind: ControlResourceMessageKind;
  readonly id: string;
  readonly action?: ResourceAction;
  readonly argument?: unknown;
  readonly value?: unknown;
  readonly error?: boolean;
  readonly code?: BusinessErrorCode;
}

export interface IControlResourceChannel extends Pick<EventEmitter, 'on' | 'off' | 'once'> {
  readonly connected?: boolean;
  send?(value: IControlResourceMessage, callback: (error: Error | null) => void): boolean;
}

enum ResourceAction {
  Read = 'Read',
  Change = 'Change',
  BeginCalibration = 'BeginCalibration',
  ReadLease = 'ReadLease',
  ApplyLease = 'ApplyLease',
  RestoreLease = 'RestoreLease',
}

interface ICommand {
  readonly kind: ControlResourceMessageKind.Command;
  readonly id: string;
  readonly action: ResourceAction;
  readonly argument: unknown;
}

function command(value: unknown): value is ICommand {
  return !!value && typeof value === 'object' && 'kind' in value && value.kind === ControlResourceMessageKind.Command
    && 'id' in value && typeof value.id === 'string' && value.id.length <= 64
    && 'action' in value && Object.values(ResourceAction).some((action) => action === value.action)
    && 'argument' in value;
}

export class ControlResourcesClient implements IInstallationResourcesPort {
  constructor(private readonly channel: IControlResourceChannel = process) {}

  read(siteIds: readonly string[]): Promise<IInstallationResourceState> {
    return this.exchange(ResourceAction.Read, siteIds, readControlResourceState);
  }

  change(input: IResourceChange): Promise<void> {
    return this.exchange(ResourceAction.Change, input, readControlResourceVoid);
  }

  async beginCalibration(): Promise<ICalibrationResourceLease> {
    const lease = await this.exchange<{ id: string; original: ICalibrationConfiguration }>(
      ResourceAction.BeginCalibration, null, readControlCalibrationLease,
    );

    return {
      original: lease.original,
      read: () => this.exchange(ResourceAction.ReadLease, { id: lease.id }, readControlResourceState),
      apply: (configuration) => this.exchange(
        ResourceAction.ApplyLease, { id: lease.id, configuration }, readControlResourceState,
      ),
      restore: () => this.exchange(ResourceAction.RestoreLease, { id: lease.id }, readControlResourceVoid),
    };
  }

  private exchange<T>(action: ResourceAction, argument: unknown, read: (value: unknown) => T): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = randomUUID();
      let settled = false;
      const finish = (error: Error | null, value?: T): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        this.channel.off('message', message);
        this.channel.off('disconnect', disconnected);

        if (error) {
          reject(error);
        } else {
          resolve(value!);
        }
      };
      const message = (value: unknown): void => {
        if (
          !value
          || typeof value !== 'object'
          || !('kind' in value)
          || value.kind !== ControlResourceMessageKind.Result
          || !('id' in value)
          || value.id !== id
        ) {
          return;
        }
        if ('error' in value) {
          const code = 'code' in value
            ? Object.values(BusinessErrorCode).find((code) => code === value.code) : undefined;

          finish(code ? new BusinessError(code, 'Coordinator resource operation failed')
            : new Error('Coordinator resource operation failed'));
        } else {
          try {
            finish(null, read('value' in value ? value.value : undefined));
          } catch (error) {
            finish(error instanceof Error ? error : new Error('Invalid resource response'));
          }
        }
      };
      const disconnected = (): void => finish(new Error('Coordinator resource channel disconnected'));
      const timer = setTimeout(() => {
        finish(new Error('Resource outcome not confirmed; reconcile actual state'));
      }, 65000);

      this.channel.on('message', message);
      this.channel.once('disconnect', disconnected);

      if (!this.channel.send || this.channel.connected === false) {
        disconnected();

        return;
      }

      try {
        this.channel.send({ kind: ControlResourceMessageKind.Command, id, action, argument }, (error) => {
          if (error) {
            finish(error);
          }
        });
      } catch (error) {
        finish(error instanceof Error ? error : new Error('Resource channel send failed'));
      }
    });
  }
}

export class ControlResourcesBroker {
  private readonly leases = new Map<string, ICalibrationResourceLease>();
  private readonly pending = new Set<Promise<void>>();
  private readonly failures: unknown[] = [];
  private closed = false;
  private closing: Promise<void> | null = null;
  private readonly receive = (value: unknown): void => {
    if (this.closed || !command(value)) {
      return;
    }

    const task = this.execute(value).then(
      (result) => this.send({ kind: ControlResourceMessageKind.Result, id: value.id, value: result }),
      (error: unknown) => this.send({
        kind: ControlResourceMessageKind.Result,
        id: value.id,
        error: true,
        ...(error instanceof BusinessError ? { code: error.code } : {}),
      }),
    );
    const observed = task.then(() => {
      this.pending.delete(observed);
    }, (error: unknown) => {
      this.failures.push(error);
      this.pending.delete(observed);
    });

    this.pending.add(observed);
  };

  constructor(private readonly channel: IControlResourceChannel,
    private readonly resources: IInstallationResourcesPort) {
    channel.on('message', this.receive);
  }

  close(): Promise<void> {
    this.closed = true;
    this.channel.off('message', this.receive);
    this.closing ??= this.dispose();

    return this.closing;
  }

  private async execute(value: ICommand): Promise<unknown> {
    if (value.action === ResourceAction.Read) {
      if (!Array.isArray(value.argument) || !value.argument.every((id) => typeof id === 'string')) {
        throw new RangeError('Invalid resource site list');
      }

      return this.resources.read(value.argument);
    }
    if (value.action === ResourceAction.Change) {
      return this.resources.change(readControlResourceChange(value.argument));
    }
    if (value.action === ResourceAction.BeginCalibration) {
      if (!this.resources.beginCalibration) {
        throw new Error('Calibration admission unavailable');
      }

      const lease = await this.resources.beginCalibration();
      const id = randomUUID();

      this.leases.set(id, lease);

      return { id, original: lease.original };
    }

    const argument = value.argument;

    if (!argument || typeof argument !== 'object' || !('id' in argument) || typeof argument.id !== 'string') {
      throw new RangeError('Invalid calibration lease identity');
    }

    const lease = this.leases.get(argument.id);

    if (!lease) {
      if (value.action === ResourceAction.RestoreLease) {
        return;
      }
      throw new Error('Calibration lease unavailable');
    }
    if (value.action === ResourceAction.ReadLease) {
      return lease.read();
    }
    if (value.action === ResourceAction.ApplyLease && 'configuration' in argument) {
      return lease.apply(readControlCalibrationConfiguration(argument.configuration));
    }
    if (value.action === ResourceAction.RestoreLease) {
      await lease.restore();
      this.leases.delete(argument.id);

      return;
    }
    throw new RangeError('Unsupported resource operation');
  }

  private send(value: IControlResourceMessage): Promise<void> {
    if (this.closed || this.channel.connected === false) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      try {
        if (!this.channel.send) {
          throw new Error('Resource channel unavailable');
        }
        this.channel.send(value, (error) => error ? reject(error) : resolve());
      } catch (error) {
        reject(error);
      }
    });
  }

  private async dispose(): Promise<void> {
    await Promise.all(this.pending);
    const restored = await Promise.allSettled([...this.leases.values()].map((lease) => lease.restore()));

    this.leases.clear();
    const failures = [
      ...this.failures,
      ...restored.filter((result) => result.status === 'rejected').map((result) => result.reason),
    ];

    if (failures.length) {
      throw new AggregateError(failures, 'Control worker resource cleanup failed');
    }
  }
}
