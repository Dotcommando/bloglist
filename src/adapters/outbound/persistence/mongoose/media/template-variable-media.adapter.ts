import type { ClientSession, Model } from 'mongoose';

import { libraryView } from '../../../../../domain/media/file-library.js';
import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import type {
  ITemplateVariableMedia,
} from '../../../../../ports/outbound/template-variables/template-variables.port.js';
import type { IMediaLibraryRecord } from './file-library-store.adapter.js';

export class TemplateVariableMediaAdapter implements ITemplateVariableMedia {
  constructor(private readonly libraries: Model<IMediaLibraryRecord>, private readonly publicPath: string | null) {}

  async read(siteId: string): ReturnType<ITemplateVariableMedia['read']> {
    const record = await this.libraries.findOne({ _id: siteId, siteId }).lean().exec();

    if (!record) {
      return { version: '0', files: [], pending: false };
    }
    if (!this.publicPath) {
      throw new Error('TV media references require configured media delivery');
    }

    return libraryView(record, this.publicPath, record.pending);
  }

  async guard(siteId: string, version: string, session: ClientSession): Promise<void> {
    const result = await this.libraries.updateOne({ _id: siteId, siteId, version, pending: false }, {
      $inc: { tvFence: 1 },
      ...(version === '0' ? {
        $setOnInsert: {
          siteId, version: '0', files: [], folders: [], garbage: [], pending: false,
        },
      } : {}),
    }, { session, upsert: version === '0' }).exec();

    if (!result.matchedCount && !result.upsertedCount) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Files changed before TV save');
    }
  }
}
