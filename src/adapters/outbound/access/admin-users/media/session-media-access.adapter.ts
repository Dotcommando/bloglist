import type { ICurrentAdminUser } from '../../../../../domain/admin-auth/admin-auth-session.js';
import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import type { IGetCurrentAdminUser } from '../../../../../ports/inbound/admin-auth/get-current-admin-user.port.js';
import type { IGetSite } from '../../../../../ports/inbound/sites/get-site.port.js';
import type { IAssetAccessPort } from '../../../../../ports/outbound/media/asset-access.port.js';
import type { IMediaLibraryAccess } from '../../../../../ports/outbound/media/file-library.port.js';

export class SessionMediaAccessAdapter implements IMediaLibraryAccess, IAssetAccessPort {
  private user: Promise<ICurrentAdminUser> | undefined;

  constructor(private readonly current: IGetCurrentAdminUser, private readonly token: string | null,
    private readonly sites: IGetSite) {}

  async actorId(): Promise<string> {
    this.user ??= this.current.execute({ token: this.token });
    const { user } = await this.user;

    if (user.blocked) {
      throw new BusinessError(BusinessErrorCode.Forbidden, 'Active account required');
    }

    return user.adminUserId;
  }

  async requireEditor(siteId: string): Promise<void> {
    await this.actorId();
    const { user } = await this.user!;

    if (
      !user.authorization?.systemAdmin
      && !user.authorization?.siteAdminSiteIds.includes(siteId)
      && !user.authorization?.siteGrants?.some((grant) => grant.siteId === siteId)
    ) {
      throw new BusinessError(BusinessErrorCode.Forbidden, 'Site is outside the assigned scope');
    }
    if (!await this.sites.execute({ siteId })) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Site not found');
    }
  }

  async requirePermission(siteId: string, actorId: string): Promise<void> {
    await this.requireEditor(siteId);

    if (actorId !== await this.actorId()) {
      throw new BusinessError(BusinessErrorCode.Forbidden, 'Foreign media actor');
    }
  }

  async requireProcessing(siteId: string): Promise<void> {
    await this.requireEditor(siteId);
  }
}
