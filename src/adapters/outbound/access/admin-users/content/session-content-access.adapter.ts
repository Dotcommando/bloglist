import type { ICurrentAdminUser } from '../../../../../domain/admin-auth/admin-auth-session.js';
import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import type { IGetCurrentAdminUser } from '../../../../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type { IPageAccessPort } from '../../../../../ports/outbound/pages/page-access.port.js';
import type { IPublicationAccessPort } from '../../../../../ports/outbound/publication/publication-access.port.js';
import type { IRoutingAccessPort } from '../../../../../ports/outbound/routing/routing-access.port.js';
import type { ISiteAccessPort } from '../../../../../ports/outbound/sites/site-access.port.js';

export class SessionContentAccessAdapter
implements ISiteAccessPort, IPageAccessPort, IPublicationAccessPort, IRoutingAccessPort {
  private authorization: Promise<ICurrentAdminUser> | undefined;

  constructor(private readonly current: IGetCurrentAdminUser, private readonly token: string | null) {}

  async assertCanCreateSite(): Promise<void> {
    if (!(await this.requireAccount()).authorization?.systemAdmin) {
      throw new BusinessError(BusinessErrorCode.Forbidden, 'SystemAdmin required');
    }
  }

  async assertCanListSites(): Promise<void> {
    await this.requireAccount();
  }

  async listAuthorizedSiteIds(): Promise<readonly string[] | null> {
    const user = await this.requireAccount();

    return user.authorization?.systemAdmin ? null : user.authorization?.siteIds ?? [];
  }

  async assertCanReadSite(siteId: string): Promise<void> {
    const allowed = await this.listAuthorizedSiteIds();

    if (!siteId.trim() || allowed !== null && !allowed.includes(siteId)) {
      throw new BusinessError(BusinessErrorCode.Forbidden, 'Site is outside the assigned scope');
    }
  }

  async assertCanUpdateSite(siteId: string): Promise<void> {
    await this.requireSite(siteId);
  }

  async assertCanCreatePage(siteId: string): Promise<void> {
    await this.requireSite(siteId);
  }

  async assertCanReadPage(siteId: string): Promise<void> {
    await this.requireSite(siteId);
  }

  async assertCanUpdatePage(siteId: string): Promise<void> {
    await this.requireSite(siteId);
  }

  async assertEditor(siteId: string, actorId?: string): Promise<void> {
    await this.requireSite(siteId);

    if (actorId !== undefined && actorId !== (await this.authorization!).user.adminUserId) {
      throw new BusinessError(BusinessErrorCode.Forbidden, 'Publication actor does not match the session');
    }
  }

  async assertCanAssignPageUrl(siteId: string): Promise<void> {
    await this.requireSite(siteId);
  }

  async assertCanChangePageUrl(siteId: string): Promise<void> {
    await this.requireSite(siteId);
  }

  async assertCanReadRouting(siteId: string): Promise<void> {
    await this.requireSite(siteId);
  }

  private async requireSite(siteId: string): Promise<void> {
    const user = await this.requireAccount();
    const authority = user.authorization;

    if (
      !siteId.trim()
      || !authority?.systemAdmin
      && !authority?.siteAdminSiteIds.includes(siteId)
      && !authority?.siteGrants?.some((grant) => grant.siteId === siteId)
    ) {
      throw new BusinessError(BusinessErrorCode.Forbidden, 'Site is outside the assigned scope');
    }
  }

  private async requireAccount(): Promise<ICurrentAdminUser['user']> {
    this.authorization ??= this.current.execute({ token: this.token });
    const { user } = await this.authorization;

    if (user.blocked) {
      throw new BusinessError(BusinessErrorCode.Forbidden, 'Active account required');
    }

    return user;
  }
}
