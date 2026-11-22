import type { ClientSession, Model } from 'mongoose';

import type { IHookCommitIntent } from '../../../../../domain/hooks/hook-execution.js';
import { type IPageState, Page } from '../../../../../domain/pages/page.js';
import { PageConflictError } from '../../../../../domain/pages/page-conflict.error.js';
import { assertPageParent } from '../../../../../domain/pages/page-tree.policy.js';
import type { IPageTreeStore } from '../../../../../ports/outbound/pages/page-tree-store.port.js';
import type { MongooseHookEvents } from '../hooks/hook-events.adapter.js';
import { recordHookChange } from '../hooks/hook-mutation.js';
import { lockSiteContent } from '../sites/site-content-guard.js';
import { toPage } from './page.repository.js';
import type { IPageRecord } from './page.schema.js';
import { pageCapture } from './page-capture.js';

export class MongoosePageTreeStore implements IPageTreeStore {
  constructor(private readonly pages: Model<IPageRecord>, private readonly now: () => Date,
    private readonly lock: (session: ClientSession, siteId: string) => Promise<void>
      = (session, siteId) => lockSiteContent(pages.db, session, siteId), private readonly hookEvents?:
    MongooseHookEvents) {}

  async move(expected: IPageState, parentPageId: string | null, hookChange?: IHookCommitIntent): Promise<Page> {
    const session = await this.pages.db.startSession();
    let committing = false;

    try {
      session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      await this.lock(session, expected.siteId);
      const records = await this.pages.find({ siteId: expected.siteId }).session(session).lean().exec();

      assertPageParent(expected.siteId, expected.pageId, parentPageId,
        records.map((record) => toPage(record).toState()));
      const { pageId, ...fields } = expected;
      const now = this.now();
      const result = await this.pages.updateOne({
        _id: pageId,
        ...pageCapture(fields),
        ...(expected.rendering === undefined ? { rendering: { $exists: false } } : {}),
      },
      { $set: { parentPageId, updatedAt: now } }, { session }).exec();

      if (result.matchedCount !== 1) {
        throw new PageConflictError('Page changed before moving');
      }
      await recordHookChange(this.hookEvents, hookChange, session);
      committing = true;
      await session.commitTransaction();

      return new Page({ ...expected, parentPageId, updatedAt: now });
    } catch (error) {
      if (!committing) {
        await session.abortTransaction().catch(() => {});

        if (error instanceof Error && 'code' in error && [11000, 112, 244].includes(Number(error.code))) {
          throw new PageConflictError('Concurrent page tree change');
        }
      }
      throw error;
    } finally {
      await session.endSession().catch(() => {});
    }
  }
}
