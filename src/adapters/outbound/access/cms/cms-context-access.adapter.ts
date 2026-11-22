import { BusinessError, BusinessErrorCode } from '../../../../domain/shared/business-error.js';
import type { ICmsContext } from '../../../../ports/outbound/cms/cms-operations.port.js';

/** Authority is supplied by trusted extension composition, never by an HTTP payload or local operator. */
export class CmsContextAccessAdapter {
  constructor(private readonly context: ICmsContext,
    private readonly siteExists: (siteId: string) => Promise<boolean>) {}

  private async check(siteId = this.context.siteId, actorId = this.context.actorId): Promise<void> {
    if (
      !this.context.siteId.trim()
      || !this.context.actorId.trim()
      || siteId !== this.context.siteId
      || actorId !== this.context.actorId
    ) {
      throw new BusinessError(BusinessErrorCode.Forbidden, 'CMS extension context mismatch');
    }
    if (!await this.siteExists(siteId)) {
      throw new BusinessError(BusinessErrorCode.NotFound, 'Site not found');
    }
  }

  async assertCanListSites(): Promise<void> {
    await this.check();
  }

  async assertCanCreateSite(): Promise<void> {
    await this.check();
    this.requireInstallationContext();
  }

  async assertCanReadSite(siteId: string): Promise<void> {
    await this.check(siteId);
  }

  async assertCanUpdateSite(siteId: string): Promise<void> {
    await this.check(siteId);
  }

  async assertCanArchiveSite(siteId: string): Promise<void> {
    await this.check(siteId);
  }

  async assertCanCreatePage(siteId: string): Promise<void> {
    await this.check(siteId);
  }

  async assertCanReadPage(siteId: string): Promise<void> {
    await this.check(siteId);
  }

  async assertCanUpdatePage(siteId: string): Promise<void> {
    await this.check(siteId);
  }

  async assertCanAssignPageUrl(siteId: string): Promise<void> {
    await this.check(siteId);
  }

  async assertCanChangePageUrl(siteId: string): Promise<void> {
    await this.check(siteId);
  }

  async assertCanReadRouting(siteId: string): Promise<void> {
    await this.check(siteId);
  }

  async assertEditor(siteId: string, actorId?: string): Promise<void> {
    await this.check(siteId, actorId);
  }

  async requireAdministrator(siteOrActor: string, actorId?: string): Promise<void> {
    await this.check(actorId === undefined ? this.context.siteId : siteOrActor, actorId ?? siteOrActor);

    if (actorId === undefined) {
      this.requireInstallationContext();
    }
  }

  private requireInstallationContext(): void {
    if (this.context.actorId.startsWith('cms-snippet:')) {
      throw new BusinessError(BusinessErrorCode.Forbidden, 'Installation operations are unavailable to site snippets');
    }
  }

  async requirePermission(siteId: string, actorId: string): Promise<void> {
    await this.check(siteId, actorId);
  }

  async requireProcessing(siteId: string): Promise<void> {
    await this.check(siteId);
  }

  async requireEditor(siteId: string, actorId?: string): Promise<void> {
    await this.check(siteId, actorId);
  }

  async actorId(): Promise<string> {
    await this.check();

    return this.context.actorId;
  }
}
