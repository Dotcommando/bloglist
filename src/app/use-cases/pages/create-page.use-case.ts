import { Page } from '../../../domain/pages/page.js';
import { PageConflictError } from '../../../domain/pages/page-conflict.error.js';
import { PageStatus } from '../../../domain/pages/page-status.enum.js';
import { PageType } from '../../../domain/pages/page-type.enum.js';
import type { ICreatePage, ICreatePageInput } from '../../../ports/inbound/pages/create-page.port.js';
import type { IPageRepository } from '../../../ports/outbound/pages/page.repository.js';
import type { IPageLifecycleValues } from '../../../ports/outbound/pages/page-lifecycle-values.port.js';
import type { PageRelationshipsService } from '../../services/pages/page-relationships.service.js';

export class CreatePageUseCase implements ICreatePage {
  constructor(
    private readonly pages: IPageRepository,
    private readonly relationships: PageRelationshipsService,
    private readonly lifecycleValues: IPageLifecycleValues,
  ) {}

  async execute(input: ICreatePageInput): Promise<Page> {
    const at = this.lifecycleValues.currentInstant();
    const page = new Page({
      pageId: this.lifecycleValues.nextPageId(),
      mark: input.mark,
      siteId: input.siteId,
      language: input.language,
      title: input.title,
      clusterId: input.clusterId ?? null,
      type: input.type === undefined ? PageType.STATIC : input.type,
      status: PageStatus.DRAFT,
      h1: input.h1 ?? null,
      metaTitle: input.metaTitle ?? null,
      metaDescription: input.metaDescription ?? null,
      contentMd: input.contentMd === undefined ? '' : input.contentMd,
      robotsIndex: input.robotsIndex === undefined ? true : input.robotsIndex,
      publishedAt: null,
      createdAt: at,
      updatedAt: at,
    });

    await this.relationships.validate(page.siteId, page.language, page.clusterId);

    if (await this.pages.findByMark(page.mark)) {
      throw new PageConflictError('Page mark is already in use');
    }

    return this.pages.save(page);
  }
}
