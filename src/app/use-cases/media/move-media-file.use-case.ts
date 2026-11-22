import type { IMediaLibraryView } from '../../../domain/media/file-library.js';
import { validateMediaName } from '../../../domain/media/file-library.js';
import { fileRequirement, libraryView } from '../../../domain/media/file-library.js';
import type { IFileLibraryOperations } from '../../../ports/inbound/media/file-library.port.js';
import type {
  IApplyPublishedMediaAddresses,
} from '../../../ports/inbound/publication/publish-media-address-release.port.js';
import type { IMediaReferenceUpdates } from '../../../ports/outbound/media/media-reference-updates.port.js';
import type { FileLibraryService } from '../../services/media/file-library.service.js';

export class MoveMediaFileUseCase {
  constructor(private readonly library: FileLibraryService,
    private readonly references?: IMediaReferenceUpdates,
    private readonly publication?: IApplyPublishedMediaAddresses) {}

  async execute(input: Parameters<IFileLibraryOperations['move']['execute']>[0]): Promise<IMediaLibraryView> {
    const previous = await this.library.read(input);
    const file = this.library.file(previous, input.fileId);

    validateMediaName(input.name);
    fileRequirement(!input.updateReferences || (this.references && this.publication),
      'Reference updates are not configured');
    const moved = {
      ...file,
      folderId: input.folderId,
      name: input.name,
      previousPaths: this.library.paths(previous, file),
    };
    const before = libraryView(previous, this.library.values.publicPath, false).files
      .find((item) => item.fileId === file.fileId)!;
    const result = await this.library.save(previous, {
      ...previous,
      files: previous.files.map((item) => item.fileId === file.fileId ? moved : item),
    });

    if (input.updateReferences) {
      const after = result.files.find((item) => item.fileId === file.fileId)!;
      const claimed = new Set(libraryView(previous, this.library.values.publicPath, false).files
        .filter((item) => item.fileId !== file.fileId).flatMap((item) => item.outputs.map((output) => output.url)));
      const fallback = before.outputs.find((output) => output.key === 'file')
        ?? [...before.outputs].sort((a, b) => (b.dimensions?.width ?? 0) - (a.dimensions?.width ?? 0))[0]!;
      const paths = this.library.paths(previous, file).filter((path) => !claimed.has(path)).map((from) => {
        const output = file.outputs.find((output) => output.suffix && decodeURIComponent(from).endsWith(output.suffix));
        const key = output?.key ?? fallback.key;

        return { from, to: after.outputs.find((item) => item.key === key)!.url };
      });
      const changed = paths.filter((item) => item.from !== item.to);

      await this.references!.replace(input.siteId, changed);
      await this.publication!.execute({ siteId: input.siteId, paths: changed });
    }

    return result;
  }
}
