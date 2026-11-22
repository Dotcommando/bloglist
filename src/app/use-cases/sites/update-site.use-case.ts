import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import { requireText } from '../../../domain/shared/validation.js';
import { Site } from '../../../domain/sites/site.js';
import { servingSiteAuthority, siteAddresses } from '../../../domain/sites/site-addresses.js';
import { SiteStatus } from '../../../domain/sites/site-status.enum.js';
import { updateTransliteration } from '../../../domain/sites/transliteration.policy.js';
import type { IUpdateSite, IUpdateSiteInput } from '../../../ports/inbound/sites/update-site.port.js';
import type { IHookChangesPort } from '../../../ports/outbound/hooks/hook-execution.port.js';
import type { ISiteRepository } from '../../../ports/outbound/sites/site.repository.js';
import type { ISiteEditingAccessPort } from '../../../ports/outbound/sites/site-access.port.js';
import type { ISiteAssetDirectory } from '../../../ports/outbound/sites/site-storage.port.js';
import type { ISiteUpdateStorePort } from '../../../ports/outbound/sites/site-update-store.port.js';
import { prepareCoreHook } from '../../services/hooks/core-hook-change.service.js';

export class UpdateSiteUseCase implements IUpdateSite {
  constructor(private readonly sites: ISiteRepository, private readonly updates: ISiteUpdateStorePort,
    private readonly access: Pick<ISiteEditingAccessPort, 'assertCanUpdateSite'>, private readonly directory:
    ISiteAssetDirectory | null = null, private readonly hooks: IHookChangesPort) {}

  async execute(input: IUpdateSiteInput): Promise<Site> {
    await this.access.assertCanUpdateSite(input.siteId);
    requireText(input.siteId, 'siteId');
    const found = await this.sites.findById(input.siteId);

    if (!found) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Site not found');
    }
    if (found.siteId !== input.siteId) {
      throw new BusinessError(BusinessErrorCode.Scope, 'Foreign site');
    }

    const previous = found.toState();
    const next = new Site(previous);

    if (input.transliteration) {
      const { language, rules, expectedRules, collapseHyphens, expectedCollapseHyphens } = input.transliteration;

      if (expectedCollapseHyphens !== (previous.collapseTransliterationHyphens ?? true)) {
        throw new BusinessError(BusinessErrorCode.StaleWrite, 'Transliteration settings changed');
      }
      next.changeTransliteration(updateTransliteration(previous.transliteration ?? [], language, rules, expectedRules),
        collapseHyphens);
    }
    if (input.timeZone !== undefined) {
      if (input.expectedTimeZone !== found.timeZone) {
        throw new BusinessError(BusinessErrorCode.StaleWrite, 'Site time zone changed');
      }
      next.changeTimeZone(input.timeZone);
    }
    if (input.addresses !== undefined) {
      const expected = input.expectedAddresses;
      const current = siteAddresses(previous.addresses);

      if (
        expected?.publicOrigin !== current.publicOrigin
        || expected.localOrigin !== current.localOrigin
        || expected.originMode !== current.originMode
      ) {
        throw new BusinessError(BusinessErrorCode.StaleWrite, 'Site address settings changed');
      }
      next.changeAddresses(input.addresses);
    }
    if (input.name !== undefined) {
      next.changeName(input.name);
    }
    if (input.primaryDomain !== undefined) {
      next.changePrimaryDomain(input.primaryDomain);
    }

    for (const language of input.addLanguages ?? []) {
      next.addLanguage(language);
    }

    if (input.defaultLanguage !== undefined) {
      next.changeDefaultLanguage(input.defaultLanguage);
    }

    for (const language of input.removeLanguages ?? []) {
      next.removeLanguage(language);
    }

    if (next.primaryDomain !== previous.primaryDomain) {
      const owner = await this.sites.findByPrimaryDomain(next.primaryDomain);

      if (owner && owner.siteId !== next.siteId) {
        throw new BusinessError(BusinessErrorCode.Conflict, 'Domain is already registered');
      }
    }

    const authority = servingSiteAuthority(next.toState().addresses);

    if (authority) {
      const owner = await this.sites.findByServingAuthority(authority);
      const legacy = await this.sites.findByPrimaryDomain(new URL('http://' + authority).hostname);

      if (
        owner
        && owner.siteId !== next.siteId
        || legacy
        && legacy.siteId !== next.siteId
        && legacy.status === SiteStatus.ACTIVE
        && !servingSiteAuthority(legacy.toState().addresses)
      ) {
        throw new BusinessError(BusinessErrorCode.Conflict, 'Origin already belongs to another site');
      }
    }

    const saved = await this.updates.saveUpdate(previous, next, await prepareCoreHook(this.hooks,
      input.siteId, input.siteId, 'cms.site.update.check', {
        siteId: input.siteId,
        changedFields:
      Object.keys(input).filter(key => key !== 'siteId'),
      }, 'cms.site.settings.changed', 'system'));

    if (saved.siteId !== next.siteId || saved.mark !== next.mark) {
      throw new BusinessError(BusinessErrorCode.Scope, 'Foreign saved site');
    }
    await this.directory?.synchronize(saved.siteId);

    return new Site(saved.toState());
  }
}
