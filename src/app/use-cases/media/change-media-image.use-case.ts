import type { IMediaLibraryView } from '../../../domain/media/file-library.js';
import { fileRequirement, mediaRoot } from '../../../domain/media/file-library.js';
import type { IFileLibraryOperations } from '../../../ports/inbound/media/file-library.port.js';
import type { FileLibraryService } from '../../services/media/file-library.service.js';
import type { PrepareLibraryImageService } from '../../services/media/prepare-library-image.service.js';

export class ChangeMediaImageUseCase {
  constructor(private readonly library: FileLibraryService,
    private readonly prepare: Pick<PrepareLibraryImageService, 'prepare'>) {}

  async execute(input: Parameters<IFileLibraryOperations['changeImage']['execute']>[0]): Promise<IMediaLibraryView> {
    const previous = await this.library.entry(
      input.siteId, input.fileId, input.expectedVersion, input.expectedFileVersion,
    );
    const { file } = previous;

    fileRequirement(!file.pendingReferences?.length, 'Finish the pending file reference update');
    const prepared = await this.prepare.prepare({ ...input, mode: file.mode });

    try {
      fileRequirement(mediaRoot(file) === mediaRoot(prepared), 'Replacement belongs to another root');
      const fallback = prepared.outputs.reduce((a, b) =>
        (a.dimensions?.width ?? 0) >= (b.dimensions?.width ?? 0) ? a : b);
      const retained = file.outputs.map((old) => {
        const output = prepared.outputs.find((item) => item.key === old.key) ?? fallback;

        return { ...output, key: old.key, suffix: old.suffix };
      });
      const additional = prepared.outputs.filter((output) => !retained.some((old) => old.suffix === output.suffix));
      const outputs = [...retained, ...additional];

      return await this.library.saveFile(input.siteId, previous, { ...file, image: prepared.image, outputs });
    } catch (error) {
      return this.library.discardRejected(prepared.image, error);
    }
  }
}
