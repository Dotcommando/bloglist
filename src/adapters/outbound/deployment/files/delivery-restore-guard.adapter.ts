import { mkdir, open, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { BusinessError, BusinessErrorCode } from '../../../../domain/shared/business-error.js';
import type {
  IDeliveryPermit, IDeliveryRestoreGuardPort,
} from '../../../../ports/outbound/deployment/delivery-restore-guard.port.js';

/** Uses the same private filesystem and exclusive lock as complete dump operations. */
export class FileDeliveryRestoreGuard implements IDeliveryRestoreGuardPort {
  private readonly root: string;

  constructor(dumpsRoot: string) {
    this.root = path.join(dumpsRoot, '.coordination');
  }

  async acquire(siteId: string): Promise<IDeliveryPermit | null> {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(siteId)) {
      throw new Error('Invalid delivery site identity');
    }
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const lockPath = path.join(this.root, '.operation.lock');
    let lock;

    try {
      lock = await open(lockPath, 'wx', 0o600);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
        return null;
      }
      throw error;
    }
    const directory = path.join(this.root, '.deliveries');
    const markerPath = path.join(directory, siteId);

    try {
      await lock.writeFile(String(process.pid));
      await lock.sync();
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const marker = await open(markerPath, 'w', 0o600);

      try {
        await marker.writeFile('Delivery requires reconciliation');
        await marker.sync();
      } finally {
        await marker.close();
      }
    } catch (error) {
      await lock.close();
      await rm(lockPath, { force: true });
      throw error;
    }
    let released = false;

    return {
      release: async (resolved) => {
        if (released) {
          return;
        }

        const cleanup = await Promise.allSettled([
          ...(resolved ? [rm(markerPath, { force: true })] : []),
          lock.close(),
        ]);
        const removal = await Promise.allSettled([rm(lockPath, { force: true })]);
        const failures = [...cleanup, ...removal]
          .filter(result => result.status === 'rejected').map(result => result.reason);

        released = failures.length === 0;

        if (failures.length === 1) {
          throw failures[0];
        }
        if (failures.length) {
          throw new AggregateError(failures, 'Delivery permit cleanup failed');
        }
      },
    };
  }

  /** Called only after the complete-dump operation acquired .operation.lock. */
  async assertRestorable(): Promise<void> {
    let pending: string[];

    try {
      pending = await readdir(path.join(this.root, '.deliveries'));
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return;
      }
      throw error;
    }

    if (pending.length) {
      throw new BusinessError(BusinessErrorCode.Conflict,
        'Unresolved external delivery blocks restoration; reconcile the deployment first');
    }
  }
}
