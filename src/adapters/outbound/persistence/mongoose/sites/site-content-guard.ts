import { type ClientSession, type Connection, Schema } from 'mongoose';

import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import type { IPageSiteGuardPort } from '../../../../../ports/outbound/pages/page-creation.port.js';
import { type ISiteRecord, siteSchema } from './site.schema.js';

interface ISiteContentGuard { _id: string; siteId: string; revision: number; }

const guardSchema = new Schema<ISiteContentGuard>({
  _id: String,
  siteId: String,
  revision: Number,
}, { collection: 'site_content_guards', versionKey: false, autoCreate: false, autoIndex: false, strict: 'throw' });

export async function lockSiteContent(connection: Connection, session: ClientSession, siteId: string): Promise<void> {
  await connection.model<ISiteContentGuard>('SiteContentGuard', guardSchema).updateOne({ _id: siteId }, {
    $inc: { revision: 1 },
    $setOnInsert: { siteId },
  }, { session, upsert: true, setDefaultsOnInsert: false }).exec();
}

export class PageSiteGuardAdapter implements IPageSiteGuardPort {
  constructor(private readonly connection: Connection, private readonly session: ClientSession) {}

  async requireLanguage(siteId: string, language: string): ReturnType<IPageSiteGuardPort['requireLanguage']> {
    await lockSiteContent(this.connection, this.session, siteId);
    const site = await this.connection.model<ISiteRecord>('Site', siteSchema)
      .findOne({ _id: siteId }).select({ languages: 1, transliteration: 1, collapseTransliterationHyphens: 1 })
      .session(this.session).lean().exec();

    if (!site?.languages.includes(language)) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Site language is no longer available');
    }

    return site;
  }
}
