import type { Model } from 'mongoose';

import { type IPageState, Page } from '../../../../../domain/pages/page.js';
import { PageStatus } from '../../../../../domain/pages/page-status.enum.js';
import type { IPageContentSourcePort } from '../../../../../ports/outbound/pages/page-content-source.port.js';
import { toPage } from './page.repository.js';
import type { IPageRecord } from './page.schema.js';
import type { IPagePublicationsRecord } from './page-publications.schema.js';

export class MongoosePageContentSourceAdapter implements IPageContentSourcePort {
  constructor(private readonly pages: Model<IPageRecord>, private readonly publications:
  Model<IPagePublicationsRecord>) {}

  async readWorking(siteId: string, pageId: string): Promise<IPageState | null> {
    const record = await this.pages.findOne({ _id: pageId, siteId }).lean().exec();

    return record ? toPage(record).toState() : null;
  }

  async readPublished(siteId: string): Promise<readonly IPageState[]> {
    const records = await this.publications.find({ siteId }).sort({ _id: 1 }).lean().exec();

    return records.map((record) => {
      const version = record.versions[0];

      if (
        !version
        || record.siteId !== siteId
        || version.page.siteId !== siteId
        || version.page.pageId !== record._id
        || version.page.status !== PageStatus.PUBLISHED
      ) {
        throw new Error('Inconsistent published page identity');
      }

      return new Page(version.page).toState();
    });
  }
}
