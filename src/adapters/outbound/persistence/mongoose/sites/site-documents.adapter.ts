import type { Connection } from 'mongoose';

import { Page } from '../../../../../domain/pages/page.js';
import { requireCondition } from '../../../../../domain/shared/validation.js';
import type { ISiteDocumentSeed, ISiteDocumentsPort } from '../../../../../ports/outbound/sites/site-documents.port.js';
import { type IPageRecord, pageSchema } from '../pages/page.schema.js';
import { type IPagePublicationsRecord, pagePublicationsSchema } from '../pages/page-publications.schema.js';
import { createRoutingModels } from '../routing/routing.models.js';
import { lockSiteContent } from './site-content-guard.js';

export class MongooseSiteDocuments implements ISiteDocumentsPort {
  constructor(private readonly connection: Connection) {}

  async ensure(siteId: string, documents: readonly ISiteDocumentSeed[]): Promise<readonly ISiteDocumentSeed[]> {
    const session = await this.connection.startSession();

    try {
      session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      await lockSiteContent(this.connection, session, siteId);
      const pages = this.connection.model<IPageRecord>('Page', pageSchema);
      const publications = this.connection.model<IPagePublicationsRecord>('PagePublications', pagePublicationsSchema);
      const routing = createRoutingModels(this.connection);
      const existing = await pages.find({ siteId }).session(session).lean().exec();

      if (existing.length) {
        requireCondition(existing.length === 3 && existing.every((page) => page.systemDocument),
          'Site setup cannot overwrite existing content');
        const retained = await publications.find({ siteId }).session(session).lean().exec();
        const urls = await routing.urls.find({ siteId }).session(session).lean().exec();
        const result = existing.map((record): ISiteDocumentSeed => {
          const page = retained.find((row) => row._id === record._id)?.versions[0]?.page;
          const url = urls.find((row) => row.pageId === record._id);

          requireCondition(page !== undefined && url !== undefined, 'Incomplete initial site documents');

          return {
            page: new Page(page!).toState(),
            url: {
              urlId: url!._id,
              siteId: url!.siteId,
              mark: url!.mark,
              parentUrlId: url!.parentUrlId,
              segment: url!.segment,
              path: url!.path,
              kind: url!.kind,
              pageId: url!.pageId,
              redirectTargetUrlId: url!.redirectTargetUrlId,
              redirectStatus: url!.redirectStatus,
              createdAt: url!.createdAt,
              updatedAt: url!.updatedAt,
              firstPublishedAt: url!.firstPublishedAt,
            },
          };
        });

        await session.commitTransaction();

        return result;
      }
      requireCondition(documents.length === 3 && documents.every((seed) => seed.page.siteId === siteId
        && seed.url.siteId === siteId), 'Invalid site document seed');

      for (const seed of documents) {
        const { pageId, ...page } = seed.page;
        const { urlId, ...url } = seed.url;

        await pages.insertOne({ ...page, _id: pageId, markKey: page.mark.toLowerCase() }, { session });
        await publications.insertOne({
          _id: pageId, siteId, versions: [{ publishedAt: seed.page.publishedAt!, page: seed.page }],
        }, { session });
        await routing.urls.insertOne({
          ...url, _id: urlId, markKey: url.mark.toLowerCase(), version: '1',
        }, { session });
      }
      await session.commitTransaction();

      return documents;
    } catch (error) {
      await session.abortTransaction().catch(() => undefined);
      throw error;
    } finally {
      await session.endSession();
    }
  }
}
