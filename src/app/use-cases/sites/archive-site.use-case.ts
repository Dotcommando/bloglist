import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import { requireText } from '../../../domain/shared/validation.js';
import { Site } from '../../../domain/sites/site.js';
import type { IArchiveSite, IArchiveSiteInput } from '../../../ports/inbound/sites/archive-site.port.js';
import type { IHookChangesPort } from '../../../ports/outbound/hooks/hook-execution.port.js';
import type { ISiteRepository } from '../../../ports/outbound/sites/site.repository.js';
import type { ISiteEditingAccessPort } from '../../../ports/outbound/sites/site-access.port.js';
import type { ISiteUpdateStorePort } from '../../../ports/outbound/sites/site-update-store.port.js';
import { prepareCoreHook } from '../../services/hooks/core-hook-change.service.js';

export class ArchiveSiteUseCase implements IArchiveSite {
  constructor(private readonly sites: ISiteRepository, private readonly updates: ISiteUpdateStorePort,
    private readonly access: Pick<ISiteEditingAccessPort, 'assertCanArchiveSite'>,
    private readonly hooks: IHookChangesPort) {}

  async execute(input: IArchiveSiteInput): Promise<Site> {
    await this.access.assertCanArchiveSite(input.siteId);
    requireText(input.siteId, 'siteId');
    const found = await this.sites.findById(input.siteId);

    if (!found) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Site not found');
    }
    if (found.siteId !== input.siteId) {
      throw new BusinessError(BusinessErrorCode.Scope, 'Foreign site');
    }

    const next = new Site(found.toState());

    next.archive();
    const saved = await this.updates.saveUpdate(found.toState(), next, await prepareCoreHook(this.hooks,
      input.siteId, input.siteId, 'cms.site.archive.check', { siteId: input.siteId }, 'cms.site.archived', 'system'));

    if (saved.siteId !== next.siteId || saved.mark !== next.mark) {
      throw new BusinessError(BusinessErrorCode.Scope, 'Foreign saved site');
    }

    return new Site(saved.toState());
  }
}
