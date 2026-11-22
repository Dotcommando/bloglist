import { SetupState } from '../../../domain/installation/setup-state.enum.js';
import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import { Site } from '../../../domain/sites/site.js';
import { servingSiteAuthority } from '../../../domain/sites/site-addresses.js';
import { normalizeSiteAuthority } from '../../../domain/sites/site-hostname.policy.js';
import { SiteLocalAddressInUseError } from '../../../domain/sites/site-local-address-in-use.error.js';
import { onboardingAddresses } from '../../../domain/sites/site-onboarding.policy.js';
import { SiteStatus } from '../../../domain/sites/site-status.enum.js';
import type { ICreateSite, ICreateSiteInput } from '../../../ports/inbound/sites/create-site.port.js';
import type { IHookChangesPort } from '../../../ports/outbound/hooks/hook-execution.port.js';
import type { ISiteRepository } from '../../../ports/outbound/sites/site.repository.js';
import type { ISiteAccessPort } from '../../../ports/outbound/sites/site-access.port.js';
import type { ISiteCreationValues } from '../../../ports/outbound/sites/site-creation-values.port.js';
import type { ISiteSetupPort } from '../../../ports/outbound/sites/site-setup.port.js';
import type { ISiteAssetDirectory } from '../../../ports/outbound/sites/site-storage.port.js';
import { prepareCoreHook } from '../../services/hooks/core-hook-change.service.js';

export class CreateSiteUseCase implements ICreateSite {
  constructor(private readonly repository: ISiteRepository, private readonly values: ISiteCreationValues,
    private readonly access: ISiteAccessPort, private readonly directory: ISiteAssetDirectory | null = null,
    private readonly hooks: IHookChangesPort
    , private readonly setup: ISiteSetupPort) {}

  async execute(input: ICreateSiteInput): Promise<Site> {
    await this.access.assertCanCreateSite();
    const instant = this.values.currentInstant();
    const site = new Site({
      ...(input.onboarding ? {
        addresses: onboardingAddresses(input.primaryDomain,
          input.onboarding.localAddress, input.onboarding.originMode),
      } : {}),
      mark: input.mark,
      setupState: SetupState.Pending,
      name: input.name,
      primaryDomain: input.primaryDomain,
      languages: input.languages,
      defaultLanguage: input.defaultLanguage,
      siteId: this.values.nextSiteId(),
      status: SiteStatus.ACTIVE,
      createdAt: instant,
      updatedAt: instant,
    });
    const markOwner = await this.repository.findByMark(site.mark);
    const domainOwner = await this.repository.findByPrimaryDomain(site.primaryDomain);
    const fingerprint = (value: Site): string => JSON.stringify([
      value.mark, value.name, value.primaryDomain, value.toState().languages,
      value.toState().defaultLanguage, value.toState().addresses ?? null,
    ]);
    const resumed = markOwner && domainOwner?.siteId === markOwner.siteId
      && markOwner.toState().setupState === SetupState.Pending
      && fingerprint(markOwner) === fingerprint(site) ? markOwner : null;

    if ((markOwner || domainOwner) && !resumed) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Site mark or domain already exists');
    }

    const addresses = site.toState().addresses;
    const localAuthority = addresses?.localOrigin ? normalizeSiteAuthority(new URL(addresses.localOrigin).host) : null;

    for (const authority of new Set([localAuthority, servingSiteAuthority(addresses)])) {
      if (!authority) {
        continue;
      }

      const owner = await this.repository.findByServingAuthority(authority);
      const legacy = await this.repository.findByPrimaryDomain(new URL('http://' + authority).hostname);

      if (
        owner
        && owner.siteId !== resumed?.siteId
        || legacy?.status === SiteStatus.ACTIVE
        && legacy.siteId !== resumed?.siteId
          && !servingSiteAuthority(legacy.toState().addresses)
      ) {
        if (authority === localAuthority) {
          throw new SiteLocalAddressInUseError();
        }
        throw new BusinessError(BusinessErrorCode.Conflict, 'The selected origin already belongs to a site');
      }
    }

    const expected = resumed ?? site;
    const saved = resumed ?? await this.repository.save(site, await prepareCoreHook(this.hooks, null, site.siteId,
      'cms.site.create.check', { createdSiteId: site.siteId, name: site.name }, 'cms.site.created', 'system'));

    if (
      saved.siteId !== expected.siteId
      || saved.mark !== expected.mark
      || saved.primaryDomain !== expected.primaryDomain
    ) {
      throw new BusinessError(BusinessErrorCode.Scope, 'Inconsistent saved site identity');
    }

    await this.directory?.synchronize(saved.siteId);
    const intent = await prepareCoreHook(this.hooks, saved.siteId, saved.siteId, 'cms.site.setup.complete.check',
      { siteId: saved.siteId }, 'cms.site.setup.completed');
    const completed = new Site(saved.toState());

    completed.completeSetup(intent.occurredAt, intent.actorId, intent.operationId);

    return this.setup.complete(saved, completed, intent);
  }
}
