import type { Page } from '../../../domain/pages/page.js';
import type { IUpdatePage, IUpdatePageInput } from '../../../ports/inbound/pages/update-page.port.js';
import type { IPageRepository } from '../../../ports/outbound/pages/page.repository.js';
import type { PageScopeService } from '../../services/pages/page-scope.service.js';

export class UpdatePageUseCase implements IUpdatePage {
  constructor(
    private readonly pages: IPageRepository,
    private readonly scope: PageScopeService,
  ) {}

  async execute(input: IUpdatePageInput): Promise<Page> {
    const page = await this.scope.requirePage(input.siteId, input.pageId);

    if (input.title !== undefined) {
      page.changeTitle(input.title);
    }
    if (input.h1 !== undefined) {
      page.changeHeading(input.h1);
    }
    if (input.metaTitle !== undefined || input.metaDescription !== undefined) {
      page.changeSeoMetadata({
        metaTitle: input.metaTitle === undefined ? page.metaTitle : input.metaTitle,
        metaDescription: input.metaDescription === undefined ? page.metaDescription : input.metaDescription,
      });
    }
    if (input.contentMd !== undefined) {
      page.changeContent(input.contentMd);
    }
    if (input.type !== undefined) {
      page.changeType(input.type);
    }
    if (input.robotsIndex !== undefined) {
      page.setRobotsIndex(input.robotsIndex);
    }

    return this.pages.save(page);
  }
}
