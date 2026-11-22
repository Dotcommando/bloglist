import { BusinessError, BusinessErrorCode } from '../../../domain/shared/business-error.js';
import type { IGetPublishedPage, IListPageVersions } from '../../../ports/inbound/cms/published-pages.port.js';
import type { ICmsPublishedPagesPort } from '../../../ports/outbound/cms/published-pages.port.js';
import type { IPageAccessPort } from '../../../ports/outbound/pages/page-access.port.js';

export class GetPublishedPageUseCase implements IGetPublishedPage {
  constructor(private readonly access: Pick<IPageAccessPort, 'assertCanReadPage'>,
    private readonly publications: ICmsPublishedPagesPort) {}

  async execute(input: Parameters<IGetPublishedPage['execute']>[0]): ReturnType<IGetPublishedPage['execute']> {
    await this.access.assertCanReadPage(input.siteId);

    if (input.releaseId !== undefined && input.pageVersionId !== undefined) {
      throw new BusinessError(BusinessErrorCode.Validation, 'Choose a release or a page version');
    }
    if (input.pageVersionId !== undefined) {
      return (await this.publications.versions(input.siteId, input.pageId))
        .find((version) => version.pageVersionId === input.pageVersionId)?.page ?? null;
    }

    return this.publications.readRelease(input.siteId, input.pageId, input.releaseId);
  }
}

export class ListPageVersionsUseCase implements IListPageVersions {
  constructor(private readonly access: Pick<IPageAccessPort, 'assertCanReadPage'>,
    private readonly publications: ICmsPublishedPagesPort) {}

  async execute(input: Parameters<IListPageVersions['execute']>[0]): ReturnType<IListPageVersions['execute']> {
    await this.access.assertCanReadPage(input.siteId);

    return this.publications.versions(input.siteId, input.pageId);
  }
}
