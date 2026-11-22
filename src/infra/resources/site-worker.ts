import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { AddonShutdownReason } from '@zarya/addon-contracts/addons';
import type { Connection } from 'mongoose';

import type { AddonPackageRegistry } from '../../adapters/outbound/runtime/addons/addon-package-registry.js';
import { ProcessDumpCapacityClient } from '../../adapters/outbound/runtime/processes/dump-capacity-client.js';
import { ADDON_PACKAGE_REGISTRY } from '../addons/addons.tokens.js';
import { MONGO_CONNECTION } from '../persistence/persistence.tokens.js';
import { createPublicHttpApplication } from '../public-http.application.js';
import type { IPublicHttpSettings } from '../public-http.settings.js';

let application: INestApplication<Server> | null = null;

let stopping = false;

async function stop(addonKey?: string, deadlineAt?: string): Promise<void> {
  if (stopping) {
    return;
  }
  stopping = true;

  try {
    if (application) {
      if (addonKey) {
        await application.get<AddonPackageRegistry>(ADDON_PACKAGE_REGISTRY).shutdown(addonKey, {
          reason: AddonShutdownReason.Update, deadlineAt: Date.parse(deadlineAt ?? ''),
        });
      }

      const server = application.getHttpServer();

      // Nest destroys providers before its HTTP adapter. Drain responses before closing their caches/pools.
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
        server.closeIdleConnections();
      });
      await application.close();
    }
    process.exitCode = 0;
  } catch {
    process.exitCode = 1;
  } finally {
    process.disconnect?.();
  }
}

process.once('disconnect', () => {
  // The installation coordinator owns admission; orphan workers must not keep serving.
  if (!stopping) {
    process.exit(1);
  }
});

process.on('message', (message: unknown) => {
  if (!message || typeof message !== 'object' || !('kind' in message)) {
    return;
  }
  if (
    message.kind === 'prepare-update'
    && application
    && 'addonKey' in message
    && typeof message.addonKey === 'string'
  ) {
    void application.get<AddonPackageRegistry>(ADDON_PACKAGE_REGISTRY).notifyShutdown(message.addonKey, {
      reason: AddonShutdownReason.Update,
      deadlineAt: 'deadlineAt' in message && typeof message.deadlineAt === 'string'
        ? Date.parse(message.deadlineAt) : NaN,
    }).catch(() => {
      process.exitCode = 1;
    });
  } else if (message.kind === 'drain') {
    void stop('addonKey' in message && typeof message.addonKey === 'string' ? message.addonKey : undefined,
      'deadlineAt' in message && typeof message.deadlineAt === 'string' ? message.deadlineAt : undefined);
  }
});

try {
  if (!process.send || !process.env.ZARYA_PROCESS_BOOTSTRAP || !process.env.ZARYA_PROCESS_SITE) {
    throw new Error('Private worker bootstrap required');
  }

  const settings: IPublicHttpSettings = JSON.parse(process.env.ZARYA_PROCESS_BOOTSTRAP);

  delete process.env.ZARYA_PROCESS_BOOTSTRAP;
  const dumpClient = new ProcessDumpCapacityClient(process.env.ZARYA_PROCESS_SITE);

  application = await createPublicHttpApplication({
    ...settings,
    host: '127.0.0.1',
    port: 0,
    backgroundWork: false,
    dumpCapacity: dumpClient,
    dumpChildCapture: dumpClient,
  });
  const address = application.getHttpServer().address();

  if (!address || typeof address === 'string') {
    throw new Error('Serving address unavailable');
  }

  const databasePoolSize = application.get<Connection>(MONGO_CONNECTION).getClient().options.maxPoolSize;

  process.send({ kind: 'ready', port: address.port, databasePoolSize }, (error: Error | null) => {
    if (error) {
      void stop();
    }
  });
} catch {
  await application?.close();
  process.exitCode = 1;
  process.disconnect?.();
}
