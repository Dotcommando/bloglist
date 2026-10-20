import type { Page } from '../../../domain/pages/page.js';
import type { IPublishPage, IPublishPageInput } from '../../../ports/inbound/pages/publish-page.port.js';
import type { IPageRepository } from '../../../ports/outbound/pages/page.repository.js';
import type { IPageLifecycleValues } from '../../../ports/outbound/pages/page-lifecycle-values.port.js';
import type { PageScopeService } from '../../services/pages/page-scope.service.js';

export class PublishPageUseCase implements IPublishPage {
  constructor(
    private readonly pages: IPageRepository,
    private readonly scope: PageScopeService,
    private readonly lifecycleValues: IPageLifecycleValues,
  ) {}

  async execute(input: IPublishPageInput): Promise<Page> {
    const page = await this.scope.requirePage(input.siteId, input.pageId);

    page.publish(this.lifecycleValues.currentInstant());

    return this.pages.save(page);
  }
}
