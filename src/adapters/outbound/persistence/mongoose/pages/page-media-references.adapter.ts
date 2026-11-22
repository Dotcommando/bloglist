import type { Model } from 'mongoose';

import { MediaUsageGroup, MediaUsageTargetKind } from '../../../../../domain/media/file-library.js';
import type { IPageState } from '../../../../../domain/pages/page.js';
import type {
  IMediaReferenceSource,
  IMediaReferenceSources,
} from '../../../../../ports/outbound/media/file-library.port.js';
import { mediaReferenceFileIds, mediaReferenceText } from '../../../media/references/media-usages.adapter.js';
import { toPage } from './page.repository.js';
import type { IPageRecord } from './page.schema.js';
import type { IPagePublicationsRecord } from './page-publications.schema.js';

export class PageMediaReferencesAdapter implements IMediaReferenceSources {
  constructor(private readonly pages: Model<IPageRecord>, private readonly versions: Model<IPagePublicationsRecord>) {}

  async read(siteId: string): Promise<readonly IMediaReferenceSource[]> {
    const pages = await this.pages.find({ siteId }).lean().exec();
    const versions = await this.versions.find({ siteId }).lean().exec();
    const result: IMediaReferenceSource[] = [];
    const add = (page: IPageState, state: string): void => {
      if (page.siteId !== siteId) {
        throw new Error('Foreign page reference');
      }

      const base = { title: page.title, target: { kind: MediaUsageTargetKind.Page, id: page.pageId }, state };

      result.push({ ...base, group: MediaUsageGroup.Content, field: 'contentMd', text: page.contentMd },
        {
          ...base,
          group: MediaUsageGroup.Content,
          field: 'rendering.parameters',
          text: mediaReferenceText(page.rendering?.parameters),
          fileIds: mediaReferenceFileIds(page.rendering?.parameters),
        },
        {
          ...base,
          group: MediaUsageGroup.Content,
          field: 'rendering.loaders',
          text: mediaReferenceText(page.rendering?.loaders),
        },
        {
          ...base,
          group: MediaUsageGroup.Content,
          field: 'tvValues',
          text: mediaReferenceText(page.tvValues),
          fileIds: mediaReferenceFileIds(page.tvValues),
        },
        { ...base, group: MediaUsageGroup.OpenGraph, field: 'ogImage', text: page.ogImage ?? '' });
    };

    pages.forEach((record) => add(toPage(record).toState(), 'Draft'));

    for (const record of versions) {
      if (record.siteId !== siteId) {
        throw new Error('Foreign retained page');
      }
      record.versions.forEach((version, index) => add(version.page, 'Published version ' + (index + 1)));
    }

    return result;
  }
}
