import { type IMediaLibraryView, libraryView } from '../../../domain/media/file-library.js';
import type { ILibraryScope } from '../../../ports/inbound/media/file-library.port.js';
import type {
  IMediaLibraryAccess, IMediaLibraryStore, IMediaLibraryValues,
} from '../../../ports/outbound/media/file-library.port.js';

export class ListMediaFilesUseCase {
  constructor(private readonly store: IMediaLibraryStore, private readonly access: IMediaLibraryAccess,
    private readonly values: IMediaLibraryValues) {}

  async execute(input: ILibraryScope): Promise<IMediaLibraryView> {
    await this.access.requireEditor(input.siteId);
    const { library, pending } = await this.store.read(input.siteId);

    return libraryView(library, this.values.publicPath, pending);
  }
}
