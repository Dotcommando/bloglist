import type { Model } from 'mongoose';

import type { ISiteStorageScope } from '../../../../../ports/outbound/sites/site-storage.port.js';
import type { ISiteRecord } from './site.schema.js';

export class MongooseSiteStorageScope implements ISiteStorageScope {
  constructor(private readonly sites: Model<ISiteRecord>) {}

  async primaryDomain(siteId: string): Promise<string> {
    const site = await this.sites.findOne({ _id: siteId }).lean().exec();

    if (!site) {
      throw new Error('Site storage owner is unavailable');
    }

    return site.primaryDomain;
  }
}
