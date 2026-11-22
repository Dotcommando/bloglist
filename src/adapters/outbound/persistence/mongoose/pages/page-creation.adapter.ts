import { setTimeout } from 'node:timers/promises';

import { type ClientSession, type Model, mongo, Schema } from 'mongoose';

import type { IHookCommitIntent } from '../../../../../domain/hooks/hook-execution.js';
import type { Page } from '../../../../../domain/pages/page.js';
import { PageConflictError } from '../../../../../domain/pages/page-conflict.error.js';
import { assertPageParent, maximumPageNumber, nextPageOrder } from '../../../../../domain/pages/page-tree.policy.js';
import type {
  IPageCreationPort, IPageSaveAccess, IPageSiteGuardPort,
} from '../../../../../ports/outbound/pages/page-creation.port.js';
import { createContentAttributes } from '../authorization/content-access.adapter.js';
import type { MongooseHookEvents } from '../hooks/hook-events.adapter.js';
import { recordHookChange } from '../hooks/hook-mutation.js';
import type { MongooseAutomaticPageUrl } from '../routing/automatic-page-url.adapter.js';
import { toPage } from './page.repository.js';
import type { IPageRecord } from './page.schema.js';

interface IPageSequence { readonly _id: string; readonly siteId: string; readonly lastOrdinal: bigint; }

const sequenceSchema = new Schema<IPageSequence>({
  _id: { type: String, required: true },
  siteId: { type: String, required: true },
  lastOrdinal: { type: Schema.Types.BigInt, required: true },
}, { collection: 'page_sequences', strict: 'throw', versionKey: false, autoCreate: false, autoIndex: false });

export class MongoosePageCreationAdapter implements IPageCreationPort {
  constructor(private readonly pages: Model<IPageRecord>,
    private readonly siteGuard: (session: ClientSession) => IPageSiteGuardPort,
    private readonly hookEvents?: MongooseHookEvents,
    private readonly automaticPageUrl?: MongooseAutomaticPageUrl) {}

  async create(page: Page, hookChange?: IHookCommitIntent, access: IPageSaveAccess = {}): Promise<Page> {
    const session = await this.pages.db.startSession();

    try {
      for (let attempt = 0; ; attempt++) {
        let committing = false;

        try {
          session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
          const saved = await this.insert(page, hookChange, access, session);

          committing = true;
          await session.commitTransaction();

          return saved;
        } catch (error) {
          if (!committing) {
            await session.abortTransaction().catch(() => undefined);

            if (error instanceof Error && 'code' in error && [11000, 112, 244, 251].includes(Number(error.code))) {
              if (error.code === 112 && attempt < 3) {
                await setTimeout(25 * 2 ** attempt);
                continue;
              }
              throw new PageConflictError('Concurrent page or site language change');
            }
          }
          throw error;
        }
      }
    } finally {
      await session.endSession().catch(() => undefined);
    }
  }

  private async insert(page: Page, hookChange: IHookCommitIntent | undefined, access: IPageSaveAccess,
    session: ClientSession): Promise<Page> {
    const site = await this.siteGuard(session).requireLanguage(page.siteId, page.language);
    const ownership = await createContentAttributes(this.pages.db.db!, page.siteId, access, session);
    const { pageId, ...state } = page.toState();
    const records = await this.pages.find({ siteId: page.siteId }).session(session).lean().exec();
    const siblings = records.map((record) => toPage(record).toState());

    assertPageParent(page.siteId, pageId, state.parentPageId ?? null, siblings);
    const after = siblings.reduce((maximum, item) => item.pageNumber && BigInt(item.pageNumber) > maximum
      ? BigInt(item.pageNumber) : maximum, 0n);

    if (after >= maximumPageNumber || page.pageNumber !== null) {
      throw new PageConflictError('Page number cannot be assigned by the caller or sequence is exhausted');
    }

    const sequence = await this.pages.db.model<IPageSequence>('PageSequence', sequenceSchema).findOneAndUpdate(
      { _id: page.siteId }, [{
        $set: {
          siteId: { $literal: page.siteId },
          lastOrdinal: {
            $add: [{
              $max: [{ $ifNull: ['$lastOrdinal', mongo.Long.ZERO] },
                mongo.Long.fromString(after.toString())],
            }, mongo.Long.ONE],
          },
        },
      }], { session, upsert: true, returnDocument: 'after', useBigInt64: true, updatePipeline: true }).lean().exec();
    const raw: unknown = sequence?.lastOrdinal;
    const ordinal = typeof raw === 'bigint' ? raw : mongo.Long.isLong(raw) ? BigInt(raw.toString()) : 0n;

    if (ordinal <= after || ordinal > maximumPageNumber) {
      throw new PageConflictError('Page number sequence exhausted');
    }

    const saved = await this.pages.insertOne({
      ...state,
      ...ownership,
      pageNumber: ordinal.toString(),
      sortOrder: state.sortOrder ?? nextPageOrder(siblings, state.parentPageId ?? null),
      _id: pageId,
      markKey: page.mark.toLowerCase(),
    }, { session });

    if (access.authority?.automaticPageUrl) {
      if (!this.automaticPageUrl || !access.initialUrl) {
        throw new Error('Missing prepared automatic page URL');
      }
      await this.automaticPageUrl.commit(page, access.initialUrl.url, site?.transliteration ?? [],
        site?.collapseTransliterationHyphens ?? true, session);
      await recordHookChange(this.hookEvents, access.initialUrl.hookChange, session);
    }
    await recordHookChange(this.hookEvents, hookChange, session);

    return toPage(saved.toObject());
  }
}
