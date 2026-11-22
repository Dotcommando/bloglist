import { type ISiteDump } from '../../../domain/dumps/site-dump.js';
import { requireCondition } from '../../../domain/shared/validation.js';
import type { IListSiteDumps, ISiteDumpScope } from '../../../ports/inbound/dumps/site-dumps.port.js';
import type { ISiteDumpAccess, ISiteDumpStore } from '../../../ports/outbound/dumps/site-dump-store.port.js';

export class ListSiteDumpsUseCase implements IListSiteDumps {
  constructor(private readonly store: ISiteDumpStore, private readonly access: ISiteDumpAccess) {}

  async execute(input: ISiteDumpScope): Promise<readonly ISiteDump[]> {
    requireCondition(/^[A-Za-z0-9_-]{1,128}$/.test(input.siteId), 'Invalid site identity');
    const requiredType = await this.access.requireAdministrator(input.siteId, input.actorId, 'cms.dumps.list');
    const dumps = await this.store.list(input.siteId);

    return requiredType ? dumps.filter((dump) => dump.type === requiredType) : dumps;
  }
}
