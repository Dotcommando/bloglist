import type { Model } from 'mongoose';

import type { IPageReference } from '../../../../../domain/routing/page-reference.js';
import type { IPageLookupPort } from '../../../../../ports/outbound/routing/page-lookup.port.js';
import type { IPageRecord } from './page.schema.js';

export class MongoosePageReferenceAdapter implements IPageLookupPort {
  constructor(private readonly pages: Model<IPageRecord>) {}

  async findPage(siteId: string, pageId: string): Promise<IPageReference | null> {
    const row = await this.pages.findOne({ siteId, _id: pageId }).select({ _id: 1, siteId: 1 }).lean().exec();

    return row ? { siteId: row.siteId, pageId: row._id } : null;
  }
}
