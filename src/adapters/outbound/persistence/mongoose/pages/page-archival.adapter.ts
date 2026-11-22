import type { Model } from 'mongoose';

import type { IHookCommitIntent } from '../../../../../domain/hooks/hook-execution.js';
import { type IPageState, Page } from '../../../../../domain/pages/page.js';
import { PageConflictError } from '../../../../../domain/pages/page-conflict.error.js';
import { PageStatus } from '../../../../../domain/pages/page-status.enum.js';
import type { IPageArchivalPort } from '../../../../../ports/outbound/pages/page-archival.port.js';
import type { MongooseHookEvents } from '../hooks/hook-events.adapter.js';
import { persistHookChange } from '../hooks/hook-mutation.js';
import { toPage } from './page.repository.js';
import type { IPageRecord } from './page.schema.js';
import { pageCapture } from './page-capture.js';

export class MongoosePageArchivalAdapter implements IPageArchivalPort {
  constructor(private readonly pages: Model<IPageRecord>, private readonly now: () => Date,
    private readonly hookEvents?: MongooseHookEvents) {}

  async archive(expected: IPageState, hookChange?: IHookCommitIntent): Promise<Page> {
    return persistHookChange(this.hookEvents, hookChange, async (session) => {

      const { pageId, ...fields } = new Page(expected).toState();
      const updated = await this.pages.findOneAndUpdate({
        _id: pageId,
        ...pageCapture(fields),
        ...(expected.rendering === undefined ? { rendering: { $exists: false } } : {}),
      }, { $set: { status: PageStatus.ARCHIVED, updatedAt: this.now() } },
      { returnDocument: 'after', runValidators: true, upsert: false, ...(session ? { session } : {}) }).lean().exec();

      if (!updated) {
        throw new PageConflictError('Page changed before archival');
      }

      return toPage(updated);

    });
  }
}
