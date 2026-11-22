import type { ISiteDump } from '../../../domain/dumps/site-dump.js';
import { DumpExecutionMode } from '../../../domain/resources/site-process-allocation.js';
import type { ICaptureSiteDump } from '../../../ports/inbound/resources/capture-site-dump.port.js';
import type { ISiteDumpCapturePort } from '../../../ports/outbound/dumps/site-dump-capture.port.js';
import type { IDumpCapacityPort } from '../../../ports/outbound/resources/dump-capacity.port.js';

export class CaptureSiteDumpUseCase implements ICaptureSiteDump {
  constructor(private readonly capacity: IDumpCapacityPort, private readonly child: ISiteDumpCapturePort,
    private readonly inline: ISiteDumpCapturePort) {}

  async execute(input: Parameters<ICaptureSiteDump['execute']>[0]): Promise<ISiteDump> {
    input.signal?.throwIfAborted();
    const lease = await this.capacity.reserve(input.siteId);
    let failed = false;
    let failure: unknown;
    let result: ISiteDump | undefined;

    try {
      input.signal?.throwIfAborted();
      const capture = lease.mode === DumpExecutionMode.InProcess ? this.inline : this.child;

      result = await capture.capture(input.siteId, input.options, input.signal);
    } catch (error) {
      failed = true;
      failure = error;
    }

    try {
      await lease.release();
    } catch (error) {
      if (failed) {
        throw new AggregateError([failure, error], 'Dump failed and serving capacity could not be restored');
      }
      throw error;
    }

    if (failed) {
      throw failure;
    }
    if (!result) {
      throw new Error('Dump capture did not return completed metadata');
    }

    return result;
  }
}
