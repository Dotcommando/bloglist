import { validateDumpCreation } from '../../../domain/dumps/dump-selection.policy.js';
import { type ISiteDump, SiteDumpType } from '../../../domain/dumps/site-dump.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import { requireCondition } from '../../../domain/shared/validation.js';
import type { ICreateSiteDump } from '../../../ports/inbound/dumps/site-dumps.port.js';
import type { ISiteDumpAccess, ISiteDumpStore } from '../../../ports/outbound/dumps/site-dump-store.port.js';

export class CreateSiteDumpUseCase implements ICreateSiteDump {
  constructor(private readonly store: ISiteDumpStore, private readonly access: ISiteDumpAccess) {}

  async execute(input: Parameters<ICreateSiteDump['execute']>[0]): Promise<ISiteDump> {
    requireCondition(/^[A-Za-z0-9_-]{1,128}$/.test(input.siteId), 'Invalid site identity');
    const requiredType = await this.access.requireAdministrator(input.siteId, input.actorId, 'cms.dumps.create');

    if (input.options) {
      if (
        input.options.type === SiteDumpType.Installation
        || requiredType
        && input.options.type !== SiteDumpType.Site
      ) {
        throw new BusinessError(BusinessErrorCode.Forbidden, 'Only a full site archive is available');
      }
      validateDumpCreation(input.options);

      return this.store.create(input.siteId, input.options);
    }

    return this.store.create(input.siteId);
  }
}
