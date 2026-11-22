import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import type { ClientSession, Model } from 'mongoose';

import type { IHookCommitIntent } from '../../../../../domain/hooks/hook-execution.js';
import { RoutingConflictError } from '../../../../../domain/routing/routing-conflict.error.js';
import type { Url } from '../../../../../domain/routing/url.js';
import { type IVirtualUrlSnapshot, virtualUrlChildren } from '../../../../../domain/routing/virtual-url.policy.js';
import type { IVirtualUrlStore } from '../../../../../ports/outbound/routing/virtual-url-store.port.js';
import type { MongooseHookEvents } from '../hooks/hook-events.adapter.js';
import { recordHookChange } from '../hooks/hook-mutation.js';
import { toPage } from '../pages/page.mapper.js';
import type { IPageRecord } from '../pages/page.schema.js';
import { lockSiteContent } from '../sites/site-content-guard.js';
import { advanceRoutingVersion, type IRoutingModels } from './routing.models.js';
import { toUrl } from './url.repository.js';

export class MongooseVirtualUrlStore implements IVirtualUrlStore {
  constructor(private readonly models: IRoutingModels, private readonly pages: Model<IPageRecord>,
    private readonly hookEvents?: MongooseHookEvents) {}

  async read(siteId: string): Promise<IVirtualUrlSnapshot> {
    return this.snapshot(siteId);
  }

  private async snapshot(siteId: string, session: ClientSession | null = null): Promise<IVirtualUrlSnapshot> {
    const urls = await this.models.urls.find({ siteId }).sort({ _id: 1 }).session(session).lean().exec();
    const pages = await this.pages.find({ siteId }).sort({ _id: 1 }).session(session).lean().exec();

    return {
      siteId, urls: urls.map((url) => toUrl(url).toState()), pages: pages.map((page) => toPage(page).toState()),
    };
  }

  async commit(expected: IVirtualUrlSnapshot, url: Url, childPageIds: readonly string[],
    hookChange?: IHookCommitIntent): Promise<void> {
    const session = await this.models.connection.startSession();
    let committing = false;

    try {
      session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      const at = url.updatedAt;

      await advanceRoutingVersion(this.models, expected.siteId, at, session);
      await lockSiteContent(this.models.connection, session, expected.siteId);
      const current = await this.snapshot(expected.siteId, session);

      if (
        !isDeepStrictEqual(current, expected)
        || !isDeepStrictEqual(virtualUrlChildren(current, url.toState()), childPageIds)
      ) {
        throw new RoutingConflictError('Virtual folder or page hierarchy changed');
      }

      const { urlId, ...fields } = url.toState();

      await this.models.urls.insertOne({
        ...fields, _id: urlId, markKey: url.mark.toLowerCase(), version: randomUUID(),
      }, { session });

      if (childPageIds.length) {
        const result = await this.pages.updateMany({ siteId: expected.siteId, _id: { $in: [...childPageIds] } }, {
          $set: { parentPageId: url.pageId, updatedAt: at },
        }, { session }).exec();

        if (result.matchedCount !== childPageIds.length) {
          throw new RoutingConflictError('Child page disappeared');
        }
      }
      await recordHookChange(this.hookEvents, hookChange, session);
      committing = true;
      await session.commitTransaction();
    } catch (error) {
      if (!committing) {
        await session.abortTransaction().catch(() => {});

        if (error instanceof Error && 'code' in error && [11000, 112, 244, 251].includes(Number(error.code))) {
          throw new RoutingConflictError('Concurrent virtual folder change');
        }
      }
      throw error;
    } finally {
      await session.endSession().catch(() => {});
    }
  }
}
