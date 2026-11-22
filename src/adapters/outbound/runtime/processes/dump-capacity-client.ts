import { randomUUID } from 'node:crypto';
import type { EventEmitter } from 'node:events';

import { type ISiteDump, type ISiteDumpCreation, SiteDumpType } from '../../../../domain/dumps/site-dump.js';
import { DumpExecutionMode } from '../../../../domain/resources/site-process-allocation.js';
import { BusinessError, BusinessErrorCode } from '../../../../domain/shared/business-error.js';
import type { ISiteDumpCapturePort } from '../../../../ports/outbound/dumps/site-dump-capture.port.js';
import type { IDumpCapacityLease, IDumpCapacityPort } from '../../../../ports/outbound/resources/dump-capacity.port.js';
import { readCompletedDump } from '../../backup/process/dump-capture.protocol.js';
import { DumpCoordinationAction, DumpCoordinationMessageKind } from './dump-coordination.protocol.js';

export class ProcessDumpCapacityClient implements IDumpCapacityPort, ISiteDumpCapturePort {
  constructor(private readonly siteId: string,
    private readonly channel: Pick<NodeJS.Process, 'send' | 'connected' | 'disconnect'>
      & Pick<EventEmitter, 'on' | 'off' | 'once'> = process) {}

  async reserve(siteId: string): Promise<IDumpCapacityLease> {
    this.requireSite(siteId);
    const value = await this.exchange({ action: DumpCoordinationAction.Reserve });
    const mode = value && typeof value === 'object' && 'mode' in value
      ? Object.values(DumpExecutionMode).find((entry) => entry === value.mode) : undefined;

    if (!mode) {
      throw new Error('Invalid dump admission response');
    }

    let released = false;

    return {
      mode,
      release: async () => {
        if (!released) {
          await this.exchange({ action: DumpCoordinationAction.Release });
          released = true;
        }
      },
    };
  }

  async capture(siteId: string, options?: ISiteDumpCreation, signal?: AbortSignal): Promise<ISiteDump> {
    this.requireSite(siteId);
    signal?.throwIfAborted();
    const value = await this.exchange({
      action: DumpCoordinationAction.Capture,
      ...(options ? { options } : {}),
    }, signal);
    const result = value && typeof value === 'object' && 'result' in value ? value.result : undefined;

    return readCompletedDump(result, options?.type ?? SiteDumpType.Site);
  }

  private requireSite(siteId: string): void {
    if (siteId !== this.siteId) {
      throw new Error('Foreign site dump admission');
    }
  }

  private exchange(command: { readonly action: DumpCoordinationAction; readonly options?: ISiteDumpCreation },
    signal?: AbortSignal): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      let settled = false;
      const finish = (error: Error | null, value?: unknown): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        this.channel.off('message', message);
        this.channel.off('disconnect', disconnected);
        signal?.removeEventListener('abort', cancel);

        if (error) {
          reject(error);
        } else {
          resolve(value);
        }
      };
      const message = (value: unknown): void => {
        if (
          value
          && typeof value === 'object'
          && 'kind' in value
          && value.kind === DumpCoordinationMessageKind.Result
          && 'id' in value
          && value.id === id
        ) {
          const code = 'code' in value
            ? Object.values(BusinessErrorCode).find((entry) => entry === value.code) : undefined;
          const error = signal?.aborted ? new Error('Dump capture canceled')
            : 'error' in value ? code ? new BusinessError(code, 'Dump coordination failed')
              : new Error('Dump coordination failed') : null;

          finish(error, value);
        }
      };
      const disconnected = (): void => finish(new Error('CMS supervisor disconnected'));
      const disconnect = (): void => {
        if (this.channel.connected) {
          try {
            this.channel.disconnect();
          } catch (error) {
            finish(error instanceof Error ? error : new Error('Dump IPC disconnect failed'));
          }
        }
      };
      const failedSend = (error: Error): void => {
        finish(error);
        disconnect();
      };
      const cancel = (): void => {
        // Wait for the capture reply: the coordinator reaps the child before acknowledging cancellation.
        if (this.channel.send && this.channel.connected) {
          try {
            this.channel.send({ kind: DumpCoordinationMessageKind.Cancel, id }, (error: Error | null) => {
              if (error) {
                failedSend(error);
              }
            });
          } catch (error) {
            failedSend(error instanceof Error ? error : new Error('Dump cancellation IPC failed'));
          }
        } else {
          disconnected();
        }
      };
      const timer = setTimeout(() => {
        finish(new Error('Dump coordination operation timed out'));
        disconnect();
      }, command.action === DumpCoordinationAction.Capture ? 1835000 : 35000);

      this.channel.on('message', message);
      this.channel.once('disconnect', disconnected);
      signal?.addEventListener('abort', cancel, { once: true });

      if (!this.channel.send || !this.channel.connected) {
        disconnected();

        return;
      }

      try {
        this.channel.send({ kind: DumpCoordinationMessageKind.Command, id, ...command }, (error: Error | null) => {
          if (error) {
            failedSend(error);
          }
        });

        if (signal?.aborted) {
          cancel();
        }
      } catch (error) {
        failedSend(error instanceof Error ? error : new Error('Dump IPC failed'));
      }
    });
  }
}
