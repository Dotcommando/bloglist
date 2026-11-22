import type { Model, QueryFilter } from 'mongoose';

import { UrlKind } from '../../../../../domain/routing/url-kind.enum.js';
import type { IUrlSearchCriteria, IUrlSuggestion } from '../../../../../domain/routing/url-search.js';
import type { IUrlSearchPort } from '../../../../../ports/outbound/routing/url-search.port.js';
import type { IUrlRecord } from './routing.models.js';

function literal(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class MongooseUrlSearchAdapter implements IUrlSearchPort {
  constructor(private readonly urls: Model<IUrlRecord>) {}

  async search(input: IUrlSearchCriteria): Promise<readonly IUrlSuggestion[]> {
    const path = {
      ...(input.query ? { $regex: literal(input.query), $options: 'i' } : {}),
      ...(input.excludePathPrefix ? { $not: { $regex: '^' + literal(input.excludePathPrefix) } } : {}),
    };
    const filter: QueryFilter<IUrlRecord> = {
      siteId: input.siteId,
      ...(input.pagesOnly ? { kind: UrlKind.PAGE } : {}),
      _id: { $ne: input.excludeUrlId },
      ...(Object.keys(path).length ? { path } : {}),
    };
    const records = await this.urls.find(filter, { _id: 1, siteId: 1, path: 1, kind: 1 })
      .sort({ path: 1 }).hint(input.pagesOnly ? 'urls_site_kind_path' : 'urls_site_path_unique')
      .skip(input.offset).limit(input.limit).lean().exec();

    return records.map((record) => ({
      siteId: record.siteId, urlId: record._id, path: record.path, kind: record.kind,
    }));
  }
}
