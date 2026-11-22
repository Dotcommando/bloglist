import { type ISiteDump } from '../../../domain/dumps/site-dump.js';
import type { IBinaryContent } from '../../../domain/shared/binary-content.js';
import { requireCondition } from '../../../domain/shared/validation.js';
import type { IImportSiteDump, ISiteDumpScope } from '../../../ports/inbound/dumps/site-dumps.port.js';
import type { ISiteDumpAccess, ISiteDumpStore } from '../../../ports/outbound/dumps/site-dump-store.port.js';

export class ImportSiteDumpUseCase implements IImportSiteDump {
  constructor(private readonly store: ISiteDumpStore, private readonly access: ISiteDumpAccess) {}

  async execute(input: ISiteDumpScope & { readonly content: IBinaryContent }): Promise<ISiteDump> {
    requireCondition(/^[A-Za-z0-9_-]{1,128}$/.test(input.siteId), 'Invalid site identity');
    const requiredType = await this.access.requireAdministrator(input.siteId, input.actorId, 'cms.dumps.import');

    requireCondition(Number.isSafeInteger(input.content.byteSize) && input.content.byteSize > 0, 'Invalid dump size');

    return requiredType ? this.store.import(input.siteId, input.content, requiredType)
      : this.store.import(input.siteId, input.content);
  }
}
