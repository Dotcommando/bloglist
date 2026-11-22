import { isDeepStrictEqual } from 'node:util';

import type { Model } from 'mongoose';

import type { IHookCommitIntent } from '../../../../../domain/hooks/hook-execution.js';
import { type IPageState, Page } from '../../../../../domain/pages/page.js';
import { PageConflictError } from '../../../../../domain/pages/page-conflict.error.js';
import type { ITemplateObject } from '../../../../../domain/pages/page-rendering.js';
import { PageStatus } from '../../../../../domain/pages/page-status.enum.js';
import type { PublishedVersionPosition } from '../../../../../domain/pages/published-page-version.js';
import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import type { IPagePublicationPort } from '../../../../../ports/outbound/pages/page-publication.port.js';
import type { MongooseHookEvents } from '../hooks/hook-events.adapter.js';
import { recordHookChange } from '../hooks/hook-mutation.js';
import type { IPageRecord } from './page.schema.js';
import { pageCapture } from './page-capture.js';
import type { IPagePublicationsRecord } from './page-publications.schema.js';

export class MongoosePagePublicationAdapter implements IPagePublicationPort {
  constructor(private readonly pages: Model<IPageRecord>, private readonly publications:
  Model<IPagePublicationsRecord>, private readonly hookEvents?: MongooseHookEvents) {}

  async publish(expected: IPageState, at: Date, hookChange?: IHookCommitIntent,
    tvValues?: ITemplateObject): Promise<Page> {
    const page = new Page(expected);

    page.publish(at);
    const next = {
      ...page.toState(),
      updatedAt: at,
      authoredTvValues: expected.tvValues ?? {},
      ...(tvValues === undefined ? {} : { tvValues }),
    };
    const { pageId, ...fields } = expected;
    const session = await this.pages.db.startSession();

    try {
      for (let attempt = 0; ; attempt++) {
        let committing = false;

        try {
          session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
          const changed = await this.pages.updateOne({
            _id: pageId,
            ...pageCapture(fields),
            ...(expected.rendering ? {} : { rendering: { $exists: false } }),
          },
          { $set: { status: next.status, publishedAt: next.publishedAt, updatedAt: at } }, { session }).exec();

          if (changed.matchedCount !== 1) {
            throw new PageConflictError('Page changed before publication');
          }
          await this.publications.updateOne({ _id: pageId, siteId: expected.siteId },
            {
              $setOnInsert: { siteId: expected.siteId },
              $push: { versions: { $each: [{ publishedAt: at, page: next }], $position: 0, $slice: 3 } },
            },
            { session, upsert: true, runValidators: true }).exec();
          await recordHookChange(this.hookEvents, hookChange, session);
          committing = true;
          await session.commitTransaction();

          return new Page(next);
        } catch (error) {
          if (!committing) {
            await session.abortTransaction().catch(() => {});

            // Dispatching hooks can update the scope during this transaction. Repeat only
            // confirmed aborted writes; captured page checks still reject real edits.
            if (error instanceof Error && 'code' in error && error.code === 112 && attempt < 2) {
              await new Promise((resolve) => setTimeout(resolve, 50 * 2 ** attempt));
              continue;
            }
            if (error instanceof Error && 'code' in error && [11000, 112].includes(Number(error.code))) {
              throw new PageConflictError('Concurrent page publication');
            }
          }
          throw error;
        }
      }
    } finally {
      await session.endSession().catch(() => {});
    }
  }

  async versions(siteId: string, pageId: string): Promise<readonly IPageState[]> {
    const record = await this.publications.findOne({ _id: pageId, siteId }).lean().exec();

    return record?.versions.map((version) => {
      if (version.page.siteId !== siteId || version.page.pageId !== pageId) {
        throw new Error('Foreign page version');
      }

      return new Page(version.page).toState();
    }) ?? [];
  }

  async restore(expected: IPageState, selected: IPageState, position: PublishedVersionPosition, draft: Page,
    at: Date, hookChange?: IHookCommitIntent): Promise<Page> {
    const next = new Page({ ...draft.toState(), updatedAt: at }).toState();

    if (![1, 2, 3].includes(position)) {
      throw new BusinessError(BusinessErrorCode.Validation, 'Invalid version position');
    }
    if (
      next.siteId !== expected.siteId
      || next.pageId !== expected.pageId
      || next.mark !== expected.mark
      || next.language !== expected.language
      || next.clusterId !== expected.clusterId
|| next.status !== PageStatus.DRAFT
      || !isDeepStrictEqual(next.createdAt, expected.createdAt)
      || !isDeepStrictEqual(
        next.publishedAt, expected.publishedAt)
    ) {
      throw new PageConflictError('Invalid restored draft identity or lifecycle');
    }

    const session = await this.pages.db.startSession();

    try {
      for (let attempt = 0; ; attempt++) {
        let committing = false;

        try {
          session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
          const { pageId, ...fields } = expected;
          const changed = await this.pages.updateOne({
            _id: pageId,
            ...pageCapture(fields),
            ...(expected.rendering === undefined ? { rendering: { $exists: false } } : {}),
          }, {
            $set: {
              title: next.title,
              h1: next.h1,
              metaTitle: next.metaTitle,
              metaDescription: next.metaDescription,
              ogTitle: next.ogTitle,
              ogDescription: next.ogDescription,
              ogImage: next.ogImage,
              ogType: next.ogType,
              contentMd: next.contentMd,
              mimeType: next.mimeType,
              excludeFromSitemap: next.excludeFromSitemap,
              tvValues: next.tvValues ?? {},
              type: next.type,
              robotsIndex: next.robotsIndex,
              status: PageStatus.DRAFT,
              updatedAt: at,
              ...(next.rendering === undefined ? {} : { rendering: next.rendering }),
            },
            ...(next.rendering === undefined ? { $unset: { rendering: 1 } } : {}),
          }, { session, runValidators: true }).exec();

          if (changed.matchedCount !== 1) {
            throw new PageConflictError('Draft changed during restoration');
          }

          const record = await this.publications.findOne({
            _id: pageId,
            siteId:
expected.siteId,
          }).session(session).lean().exec();
          const version = record?.versions[position - 1];

          if (!version) {
            throw new BusinessError(BusinessErrorCode.NotFound, 'Retained version is no longer available');
          }
          if (record.siteId !== expected.siteId || !isDeepStrictEqual(new Page(version.page).toState(), selected)) {
            throw new PageConflictError('Selected version changed during restoration');
          }
          await recordHookChange(this.hookEvents, hookChange, session);
          committing = true;
          await session.commitTransaction();

          return new Page(next);
        } catch (error) {
          if (!committing) {
            await session.abortTransaction().catch(() => {});

            if (error instanceof Error && 'code' in error && [11000, 112].includes(Number(error.code))) {
              if (Number(error.code) === 112 && attempt < 2) {
                await new Promise((resolve) => setTimeout(resolve, 50 * 2 ** attempt));
                continue;
              }
              throw new PageConflictError('Concurrent restoration or publication');
            }
          }
          throw error;
        }
      }
    } finally {
      await session.endSession().catch(() => {});
    }
  }
}
