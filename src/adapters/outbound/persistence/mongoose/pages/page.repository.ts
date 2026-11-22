import type { Model } from 'mongoose';

import type { IContentAccess } from '../../../../../domain/authorization/content-access.js';
import type { IHookCommitIntent } from '../../../../../domain/hooks/hook-execution.js';
import type { IPageState, Page } from '../../../../../domain/pages/page.js';
import { PageConflictError } from '../../../../../domain/pages/page-conflict.error.js';
import type { IPageFilter } from '../../../../../domain/pages/page-filter.js';
import type { IPageRepository } from '../../../../../ports/outbound/pages/page.repository.js';
import type { IPageCreationPort, IPageSaveAccess } from '../../../../../ports/outbound/pages/page-creation.port.js';
import { contentAccessMatch, lockContentWrite } from '../authorization/content-access.adapter.js';
import type { MongooseHookEvents } from '../hooks/hook-events.adapter.js';
import { persistHookChange } from '../hooks/hook-mutation.js';
import { toPage } from './page.mapper.js';
import type { IPageRecord } from './page.schema.js';
import { pageCapture } from './page-capture.js';

export { toPage } from './page.mapper.js';

export class MongoosePageRepository implements IPageRepository {
  constructor(private readonly model: Model<IPageRecord>, private readonly now: () => Date,
    private readonly creation: IPageCreationPort, private readonly hookEvents?: MongooseHookEvents) {}

  async findById(pageId: string, access?: IContentAccess): Promise<Page | null> {
    const record = await this.model.findOne(access
      ? { $and: [{ _id: pageId }, contentAccessMatch(access)] }
      : { _id: pageId }).lean().exec();

    return record ? toPage(record) : null;
  }

  async findByMark(siteId: string, mark: string): Promise<Page | null> {
    const record = await this.model.findOne({ siteId, markKey: mark.toLowerCase() }).lean().exec();

    return record ? toPage(record) : null;
  }

  async findBySite(siteId: string, filter: IPageFilter = {}, access?: IContentAccess): Promise<Page[]> {
    const query: IPageFilter & { siteId: string } = { siteId };

    if (filter.clusterId !== undefined) {
      query.clusterId = filter.clusterId;
    }
    if (filter.language !== undefined) {
      query.language = filter.language;
    }
    if (filter.type !== undefined) {
      query.type = filter.type;
    }
    if (filter.status !== undefined) {
      query.status = filter.status;
    }

    const records = await this.model.find(access ? { $and: [query, contentAccessMatch(access)] } : query)
      .sort({ sortOrder: 1, createdAt: 1, _id: 1 }).lean().exec();

    return records.map(toPage);
  }

  async findByCluster(clusterId: string): Promise<Page[]> {
    const records = await this.model.find({ clusterId }).sort({ _id: 1 }).lean().exec();

    return records.map(toPage);
  }

  async save(page: Page, hookChange?: IHookCommitIntent, expected?: IPageState,
    access: IPageSaveAccess = {}): Promise<Page> {

    const state = page.toState();
    const pageId = state.pageId;

    try {
      const existing = await this.findById(pageId);

      if (!existing) {
        if (expected) {
          throw new PageConflictError('Page changed during persistence');
        }

        return await this.creation.create(page, hookChange, access);
      }
      if (
        existing.siteId !== state.siteId
        || existing.mark !== state.mark
        || existing.language !== state.language
        || existing.systemDocument !== (state.systemDocument ?? null)
        || existing.pageNumber !== (state.pageNumber ?? null)
        || existing.createdAt.getTime() !== state.createdAt.getTime()
      ) {
        throw new PageConflictError('Immutable page fields differ');
      }

      return await persistHookChange(this.hookEvents, hookChange, async (session) => {
        const captured = access.authority;
        const current = captured && await lockContentWrite(this.model.db.db!, captured, session);
        const saved = await this.model.findOneAndUpdate(
          {
            ...(expected ? pageCapture(expected) : {}),
            ...(captured && current ? { $and: [contentAccessMatch(captured), contentAccessMatch(current)] } : {}),
            _id: pageId,
            siteId: state.siteId,
            mark: state.mark,
            language: state.language,
            createdAt:
            state.createdAt,
          },
          {
            $set: {
              clusterId: state.clusterId,
              sortOrder: state.sortOrder,
              type: state.type,
              status: state.status,
              title: state.title,
              h1: state.h1,
              metaTitle: state.metaTitle,
              metaDescription: state.metaDescription,
              ogTitle: state.ogTitle,
              ogDescription: state.ogDescription,
              ogImage: state.ogImage,
              ogType: state.ogType,
              contentMd: state.contentMd,
              mimeType: state.mimeType,
              excludeFromSitemap: state.excludeFromSitemap,
              ...(state.tvValues === undefined ? {} : { tvValues: state.tvValues }),
              robotsIndex: state.robotsIndex,
              publishedAt: state.publishedAt,
              updatedAt: this.now(),
              ...(state.rendering === undefined ? {} : { rendering: state.rendering }),
            },
            ...(state.rendering === undefined ? { $unset: { rendering: 1 } } : {}),
          },
          { returnDocument: 'after', runValidators: true, upsert: false, ...(session ? { session } : {}) },
        ).lean().exec();

        if (!saved) {
          throw new PageConflictError('Page changed during persistence');
        }

        return toPage(saved);
      }, false, access.authority !== undefined);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 11000) {
        throw new PageConflictError('Page identity or mark already exists');
      }
      throw error;
    }

  }
}
