import type { ClientSession, Connection, Model } from 'mongoose';

import type { IPageState } from '../../../../../domain/pages/page.js';
import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import type {
  IPageTemplateVariableStore,
} from '../../../../../ports/outbound/template-variables/template-variables.port.js';
import { toPage } from './page.mapper.js';
import type { IPageRecord } from './page.schema.js';

export class MongoosePageTemplateVariables implements IPageTemplateVariableStore {
  constructor(private readonly connection: Connection, private readonly pages: Model<IPageRecord>,
    private readonly now: () => Date,
    private readonly catalogGuard: (siteId: string, version: string, session: ClientSession) => Promise<void>,
    private readonly mediaGuard: (siteId: string, version: string, session: ClientSession) => Promise<void>) {}

  async save(expected: IPageState, next: IPageState, catalogVersion: string,
    mediaVersion: string | null): Promise<IPageState> {
    const session = await this.connection.startSession();

    try {
      session.startTransaction();
      await this.catalogGuard(expected.siteId, catalogVersion, session);

      if (mediaVersion !== null) {
        await this.mediaGuard(expected.siteId, mediaVersion, session);
      }

      const { pageId, ...fields } = expected;
      const record = await this.pages.findOneAndUpdate({
        _id: pageId,
        ...fields,
        ...(expected.tvValues === undefined ? { tvValues: { $exists: false } } : {}),
      }, { $set: { tvValues: next.tvValues, rendering: next.rendering, status: next.status, updatedAt: this.now() } },
      { session, returnDocument: 'after', runValidators: true }).lean().exec();

      if (!record) {
        throw new BusinessError(BusinessErrorCode.Conflict, 'Page changed before TV save');
      }
      await session.commitTransaction();

      return toPage(record).toState();
    } catch (error) {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
      if (error instanceof Error && 'code' in error && [11000, 112].includes(Number(error.code))) {
        throw new BusinessError(BusinessErrorCode.Conflict, 'Concurrent TV update');
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }
}
