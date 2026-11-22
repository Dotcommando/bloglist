import type { Model } from 'mongoose';

import type { IUrlState } from '../../../../../domain/routing/url.js';
import { requireCondition } from '../../../../../domain/shared/validation.js';
import type { IRoutingSourcePort } from '../../../../../ports/outbound/routing/routing-source.port.js';
import type { IUrlRecord } from './routing.models.js';
import { toUrl } from './url.repository.js';

export class MongooseRoutingSourceAdapter implements IRoutingSourcePort {
  constructor(private readonly urls: Model<IUrlRecord>) {}

  async readUrls(siteId: string): Promise<readonly IUrlState[]> {
    const records = await this.urls.find({ siteId }).sort({ _id: 1 }).lean().exec();

    return records.map((record) => {
      requireCondition(record.markKey === record.mark.toLowerCase(), 'Inconsistent stored URL mark');

      return toUrl(record).toState();
    });
  }
}
