import { EventEmitter } from 'node:events';

import {
  ControlResourcesBroker, ControlResourcesClient,
  type IControlResourceChannel, type IControlResourceMessage,
}
  from '../../src/adapters/outbound/runtime/processes/control-resources-process.js';
import { BusinessError, BusinessErrorCode } from '../../src/domain/shared/business-error.js';
import type { IInstallationResourcesPort } from '../../src/ports/outbound/resources/installation-resources.port.js';

function channels(): { parent: EventEmitter & IControlResourceChannel; child: EventEmitter & IControlResourceChannel } {
  const parent = new EventEmitter();
  const child = new EventEmitter();

  return {
    parent: Object.assign(parent, {
      send: (value: IControlResourceMessage, callback: (error: Error | null) => void) => {
        queueMicrotask(() => {
          child.emit('message', value);
          callback(null);
        });

        return true;
      },
    }),
    child: Object.assign(child, {
      connected: true,
      send: (value: IControlResourceMessage, callback: (error: Error | null) => void) => {
        queueMicrotask(() => {
          parent.emit('message', value);
          callback(null);
        });

        return true;
      },
    }),
  };
}

describe('Control worker resource ownership', () => {
  it('forwards resource changes to the coordinator and propagates read failures', async () => {
    const pair = channels();
    const resources: IInstallationResourcesPort = {
      read: vi.fn(async () => {
        throw new BusinessError(BusinessErrorCode.Conflict, 'Busy');
      }),
      change: vi.fn(async () => undefined),
    };
    const broker = new ControlResourcesBroker(pair.parent, resources);
    const client = new ControlResourcesClient(pair.child);
    const input = { expectedVersion: 'old', databaseCpu: 1, sites: [{ siteId: 'site', processes: 1 }] };

    try {
      await client.change(input);
      expect(resources.change).toHaveBeenCalledExactlyOnceWith(input);
      await expect(client.read(['site'])).rejects.toMatchObject({ code: BusinessErrorCode.Conflict });
      expect(resources.read).toHaveBeenCalledExactlyOnceWith(['site']);
      expect(pair.child.listenerCount('message')).toBe(0);
    } finally {
      await broker.close();
    }
  });

  it('restores the coordinator-owned calibration lease when the worker exits', async () => {
    const pair = channels();
    const restore = vi.fn(async () => undefined);
    const original = { databaseCpu: 1, cmsCpu: 2, sitePoolSize: 5, sites: [] };
    const broker = new ControlResourcesBroker(pair.parent, {
      read: vi.fn(),
      change: vi.fn(),
      beginCalibration: vi.fn(async () => ({ original, read: vi.fn(), apply: vi.fn(), restore })),
    });
    const client = new ControlResourcesClient(pair.child);

    try {
      const lease = await client.beginCalibration();

      expect(lease.original).toEqual(original);
      pair.parent.emit('exit', 0);
      await broker.close();
      expect(restore).toHaveBeenCalledOnce();
    } finally {
      await broker.close();
    }
  });
});
