import type { ClientSession, Model } from 'mongoose';

import type { ISitePageLanguageUsagePort } from '../../../../../ports/outbound/sites/site-update-store.port.js';
import type { IPageRecord } from './page.schema.js';

export class PageLanguageUsageAdapter implements ISitePageLanguageUsagePort {
  constructor(private readonly pages: Model<IPageRecord>, private readonly session: ClientSession | null) {}

  async hasPages(siteId: string, languages: readonly string[]): Promise<boolean> {
    return await this.pages.exists({ siteId, language: { $in: [...languages] } }).session(this.session).exec() !== null;
  }
}
