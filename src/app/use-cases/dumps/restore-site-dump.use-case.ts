import { validateDumpApplication } from '../../../domain/dumps/dump-selection.policy.js';
import { requireDumpFilename } from '../../../domain/dumps/site-dump.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import { requireCondition } from '../../../domain/shared/validation.js';
import type { IRestoreSiteDump } from '../../../ports/inbound/dumps/site-dumps.port.js';
import type { ISiteDumpAccess, ISiteDumpStore } from '../../../ports/outbound/dumps/site-dump-store.port.js';
import type { IHookChangesPort } from '../../../ports/outbound/hooks/hook-execution.port.js';
import { prepareCoreHook } from '../../services/hooks/core-hook-change.service.js';

export class RestoreSiteDumpUseCase implements IRestoreSiteDump {
  constructor(private readonly store: ISiteDumpStore, private readonly access: ISiteDumpAccess,
    private readonly hooks: IHookChangesPort) {}

  async execute(input: Parameters<IRestoreSiteDump['execute']>[0]): Promise<void> {
    requireCondition(/^[A-Za-z0-9_-]{1,128}$/.test(input.siteId), 'Invalid site identity');
    const requiredType = await this.access.requireAdministrator(input.siteId, input.actorId, 'cms.dumps.restore');

    if (requiredType && input.options) {
      throw new BusinessError(BusinessErrorCode.Forbidden, 'Only a full site archive is available');
    }
    requireDumpFilename(input.filename);
    const hookChange = await prepareCoreHook(this.hooks, input.siteId, 'site:' + input.siteId,
      input.options ? 'cms.content.import.check' : 'cms.site.restore.check',
      { siteId: input.siteId, filename: input.filename }, input.options ? 'cms.content.imported'
        : 'cms.site.restored', input.actorId);

    if (input.options) {
      validateDumpApplication(input.options);

      return this.store.restore(input.siteId, input.filename, input.options, input.actorId, hookChange);
    }

    return requiredType
      ? this.store.restore(input.siteId, input.filename, undefined, input.actorId, hookChange, requiredType)
      : this.store.restore(input.siteId, input.filename, undefined, input.actorId, hookChange);
  }
}
