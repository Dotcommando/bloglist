import { type ISiteDump, requireDumpFilename } from '../../../domain/dumps/site-dump.js';
import type { IBinaryContent } from '../../../domain/shared/binary-content.js';
import { requireCondition } from '../../../domain/shared/validation.js';
import type { IGetSiteDump, ISiteDumpSelection } from '../../../ports/inbound/dumps/site-dumps.port.js';
import type { ISiteDumpAccess, ISiteDumpStore } from '../../../ports/outbound/dumps/site-dump-store.port.js';

export class GetSiteDumpUseCase implements IGetSiteDump {
  constructor(private readonly store: ISiteDumpStore, private readonly access: ISiteDumpAccess) {}

  async execute(input: ISiteDumpSelection): Promise<ISiteDump & { readonly content: IBinaryContent }> {
    requireCondition(/^[A-Za-z0-9_-]{1,128}$/.test(input.siteId), 'Invalid site identity');
    await this.access.requireAdministrator(input.siteId, input.actorId, 'cms.dumps.download');
    requireDumpFilename(input.filename);

    return this.store.open(input.siteId, input.filename);
  }
}
