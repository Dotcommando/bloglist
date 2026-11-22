import { type ISiteDumpReview, requireDumpFilename } from '../../../domain/dumps/site-dump.js';
import type { IInspectSiteDump, ISiteDumpSelection } from '../../../ports/inbound/dumps/site-dumps.port.js';
import type { ISiteDumpAccess, ISiteDumpStore } from '../../../ports/outbound/dumps/site-dump-store.port.js';

export class InspectSiteDumpUseCase implements IInspectSiteDump {
  constructor(private readonly store: ISiteDumpStore, private readonly access: ISiteDumpAccess) {}

  async execute(input: ISiteDumpSelection): Promise<ISiteDumpReview> {
    await this.access.requireAdministrator(input.siteId, input.actorId, 'cms.dumps.inspect');
    requireDumpFilename(input.filename);

    return this.store.inspect(input.siteId, input.filename);
  }
}
