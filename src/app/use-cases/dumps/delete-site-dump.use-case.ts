import { requireDumpFilename } from '../../../domain/dumps/site-dump.js';
import { requireCondition } from '../../../domain/shared/validation.js';
import type { IDeleteSiteDump, ISiteDumpSelection } from '../../../ports/inbound/dumps/site-dumps.port.js';
import type { ISiteDumpAccess, ISiteDumpStore } from '../../../ports/outbound/dumps/site-dump-store.port.js';

export class DeleteSiteDumpUseCase implements IDeleteSiteDump {
  constructor(private readonly store: Pick<ISiteDumpStore, 'delete'>, private readonly access: ISiteDumpAccess) {}

  async execute(input: ISiteDumpSelection): Promise<void> {
    requireCondition(/^[A-Za-z0-9_-]{1,128}$/.test(input.siteId), 'Invalid site identity');
    await this.access.requireAdministrator(input.siteId, input.actorId, 'cms.dumps.delete');
    requireDumpFilename(input.filename);
    await this.store.delete(input.siteId, input.filename);
  }
}
