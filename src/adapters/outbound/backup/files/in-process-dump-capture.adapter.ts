import type { Connection } from 'mongoose';

import { type ISiteDump, type ISiteDumpCreation, SiteDumpType } from '../../../../domain/dumps/site-dump.js';
import type { ISiteDumpCapturePort } from '../../../../ports/outbound/dumps/site-dump-capture.port.js';
import type { DumpDatabase } from '../mongoose/dump-database.adapter.js';
import { DumpMaintenance } from './dump-maintenance.js';
import { InstallationDumpStore } from './installation-dump.adapter.js';
import type { IPartialAddonTransfer } from './partial-dump.adapter.js';
import { FileSiteDumpStore, type IDumpStorageSettings } from './site-dump-store.adapter.js';

/** Invoked only inside ProcessSiteDumpStore's already-held operation lock and maintenance gate. */
export class InProcessDumpCaptureAdapter extends FileSiteDumpStore implements ISiteDumpCapturePort {
  private readonly installation: InstallationDumpStore;

  constructor(storage: IDumpStorageSettings, connection: Connection, database: DumpDatabase,
    addons: IPartialAddonTransfer) {
    super(storage, database, new DumpMaintenance(), addons);
    this.installation = new InstallationDumpStore(storage, connection);
  }

  async capture(siteId: string, options?: ISiteDumpCreation, signal?: AbortSignal): Promise<ISiteDump> {
    signal?.throwIfAborted();
    const result = options?.type === SiteDumpType.Installation
      ? await this.installation.create() : await super.create(siteId, options);

    signal?.throwIfAborted();

    return result;
  }

  protected override async exclusive<T>(action: () => Promise<T>): Promise<T> {
    return action();
  }
}
