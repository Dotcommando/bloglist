import type { ClientSession, Model } from 'mongoose';

import { libraryView } from '../../../../../domain/media/file-library.js';
import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import type {
  ITemplateVariableMedia,
} from '../../../../../ports/outbound/template-variables/template-variables.port.js';
import { type IMediaLibraryRecord, readMediaLibrary } from './file-library-store.adapter.js';

export class TemplateVariableMediaAdapter implements ITemplateVariableMedia {
  constructor(private readonly libraries: Model<IMediaLibraryRecord>, private readonly publicPath: string | null) {}

  async read(siteId: string): ReturnType<ITemplateVariableMedia['read']> {
    const { library, pending } = await readMediaLibrary(this.libraries, siteId);

    if (library.version === '0') {
      return { version: '0', files: [], pending: false };
    }
    if (!this.publicPath) {
      throw new Error('TV media references require configured media delivery');
    }

    return libraryView(library, this.publicPath, pending);
  }

  async guard(siteId: string, version: string, session: ClientSession): Promise<void> {
    const result = await this.libraries.updateOne({ _id: siteId, siteId, version, pending: false }, {
      $inc: { tvFence: 1 },
      ...(version === '0' ? {
        $setOnInsert: {
          siteId, version: '0', pending: false,
        },
      } : {}),
    }, { session, upsert: version === '0' }).exec();

    if (!result.matchedCount && !result.upsertedCount) {
      throw new BusinessError(BusinessErrorCode.Conflict, 'Files changed before TV save');
    }
  }
}
