import type { ISiteDump, ISiteDumpCreation } from '../../../../domain/dumps/site-dump.js';
import type { ISiteDumpCapturePort } from '../../../../ports/outbound/dumps/site-dump-capture.port.js';
import type { DumpMaintenance } from '../files/dump-maintenance.js';
import type { IPartialAddonTransfer } from '../files/partial-dump.adapter.js';
import { FileSiteDumpStore, type IDumpStorageSettings } from '../files/site-dump-store.adapter.js';
import type { DumpDatabase } from '../mongoose/dump-database.adapter.js';

export class ProcessSiteDumpStore extends FileSiteDumpStore {
  constructor(settings: IDumpStorageSettings, database: DumpDatabase, maintenance: DumpMaintenance,
    addons: IPartialAddonTransfer, private readonly capture: ISiteDumpCapturePort) {
    super(settings, database, maintenance, addons);
  }

  override create(siteId: string, options?: ISiteDumpCreation): Promise<ISiteDump> {
    return this.exclusive(() => this.capture.capture(siteId, options), true);
  }
}
