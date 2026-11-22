import { type ISiteDumpReview, SiteDumpType } from '../../../domain/dumps/site-dump.js';
import { requireCondition } from '../../../domain/shared/validation.js';
import type { IGetDumpExportItems } from '../../../ports/inbound/dumps/site-dumps.port.js';
import type { ISiteDumpAccess, ISiteDumpStore } from '../../../ports/outbound/dumps/site-dump-store.port.js';

export class GetDumpExportItemsUseCase implements IGetDumpExportItems {
  constructor(private readonly store: ISiteDumpStore, private readonly access: ISiteDumpAccess) {}

  async execute(input: Parameters<IGetDumpExportItems['execute']>[0]): Promise<ISiteDumpReview> {
    await this.access.requireAdministrator(input.siteId, input.actorId, 'cms.dumps.export-options');
    requireCondition(Object.values(SiteDumpType).includes(input.type) && input.type !== SiteDumpType.Unknown,
      'Invalid dump type');

    return this.store.exportItems(input.siteId, input.type);
  }
}
