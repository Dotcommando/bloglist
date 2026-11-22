import type { IPageAccessPort } from '../../../../../ports/outbound/pages/page-access.port.js';
import { assertLocalAdministrator, type ILocalOperatorContext } from '../local-operator.context.js';

export class LocalPageAccessAdapter implements IPageAccessPort {
  private readonly context: ILocalOperatorContext;

  constructor(context: ILocalOperatorContext) {
    this.context = Object.freeze({ ...context });
  }

  async assertCanCreatePage(siteId: string): Promise<void> {
    this.assertAccess(siteId);
  }

  async assertCanReadPage(siteId: string): Promise<void> {
    this.assertAccess(siteId);
  }

  async assertCanUpdatePage(siteId: string): Promise<void> {
    this.assertAccess(siteId);
  }

  private assertAccess(siteId: string): void {
    assertLocalAdministrator(this.context);

    if (!siteId.trim()) {
      throw new RangeError('siteId is required');
    }
  }
}
