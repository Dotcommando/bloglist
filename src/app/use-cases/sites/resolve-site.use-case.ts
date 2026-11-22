import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import { Site } from '../../../domain/sites/site.js';
import { servingSiteAuthority } from '../../../domain/sites/site-addresses.js';
import { normalizeSiteAuthority, normalizeSiteHostname } from '../../../domain/sites/site-hostname.policy.js';
import { SiteStatus } from '../../../domain/sites/site-status.enum.js';
import type { IResolveSite, IResolveSiteInput } from '../../../ports/inbound/sites/resolve-site.port.js';
import type { ISiteRepository } from '../../../ports/outbound/sites/site.repository.js';
import type { ISiteAccessPort } from '../../../ports/outbound/sites/site-access.port.js';

export class ResolveSiteUseCase implements IResolveSite {
  constructor(private readonly repository: ISiteRepository,
    private readonly scope?: { readonly siteId: string;
      readonly access: Pick<ISiteAccessPort, 'assertCanReadSite'> }) {}

  async execute(input: IResolveSiteInput): Promise<Site | null> {
    await this.scope?.access.assertCanReadSite(this.scope.siteId);
    const hostname = normalizeSiteHostname(input.hostname);
    const authority = normalizeSiteAuthority(input.authority ?? hostname);

    if (new URL('http://' + authority).hostname !== hostname) {
      throw new BusinessError(BusinessErrorCode.Scope, 'Inconsistent request authority');
    }

    const configured = await this.repository.findByServingAuthority(authority);

    if (configured) {
      if (servingSiteAuthority(configured.toState().addresses) !== authority) {
        throw new BusinessError(BusinessErrorCode.Scope, 'Inconsistent origin mapping');
      }

      return configured.status === SiteStatus.ACTIVE && (!this.scope || configured.siteId === this.scope.siteId)
        ? new Site(configured.toState()) : null;
    }

    const site = await this.repository.findByPrimaryDomain(hostname);

    if (site && site.primaryDomain !== hostname) {
      throw new BusinessError(BusinessErrorCode.Scope, 'Inconsistent domain mapping');
    }

    return site?.status === SiteStatus.ACTIVE && site.toState().addresses?.originMode === undefined
      && (!this.scope || site.siteId === this.scope.siteId)
      ? new Site(site.toState()) : null;
  }
}
