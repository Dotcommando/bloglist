import type { IMediaLibraryView } from '../../../domain/media/file-library.js';
import { validateMediaName } from '../../../domain/media/file-library.js';
import { fileRequirement } from '../../../domain/media/file-library.js';
import type { IMediaLocatedFile } from '../../../domain/media/media-browser.js';
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
    const previous = await this.library.entry(
      input.siteId, input.fileId, input.expectedVersion, input.expectedFileVersion,
    );
    const { file } = previous;

    validateMediaName(input.name);
    fileRequirement(!file.pendingReferences?.length, 'Finish the pending file reference update');
    fileRequirement(!input.updateReferences || (this.references && this.publication
      && this.library.store.withReferenceUpdate && this.library.store.pathOwner),
    'Reference updates are not configured');
    const previousPaths = this.library.paths(previous);
    const moved = {
      ...file,
      folderId: input.folderId,
      name: input.name,
      previousPaths,
      ...(input.updateReferences ? {
        pendingReferences: await this.referencePlan(input.siteId, previous, previousPaths),
      } : {}),
    };
    const result = await this.library.saveFile(input.siteId, previous, moved);

    return input.updateReferences ? this.finish(input.siteId, file.fileId, result) : result;
  }

  async retry({ siteId, fileId }: { readonly siteId: string; readonly fileId: string }): Promise<IMediaLibraryView> {
    await this.library.access.requireEditor(siteId);
    const current = await this.library.store.locate(siteId, fileId);

    fileRequirement(current, 'Media file not found');

    const view = this.library.view(siteId, current);

    return current.file.pendingReferences?.length ? this.finish(siteId, fileId, view) : view;
  }

  private async referencePlan(siteId: string, previous: IMediaLocatedFile, paths: readonly string[]):
  Promise<readonly { from: string; key: string }[]> {
    const { file } = previous;
    const { outputs } = this.library.view(siteId, previous).files[0]!;
    const fallback = outputs.find((output) => output.key === 'file')
      ?? [...outputs].sort((a, b) => (b.dimensions?.width ?? 0) - (a.dimensions?.width ?? 0))[0]!;
    const prefix = this.library.values.publicPath + '/';
    const plan = [];

    for (const from of paths) {
      if (!from.startsWith(prefix)) {
        continue;
      }

      const match = outputs.find((item) => item.url === from);
      const decoded = decodeURIComponent(from);

      if (!match && await this.library.store.pathOwner!(siteId, decodeURIComponent(from.slice(prefix.length)))) {
        continue;
      }

      const variant = file.outputs.find((output) => output.suffix && decoded.endsWith(output.suffix));

      plan.push({ from, key: match?.key ?? variant?.key ?? fallback.key });
    }

    return plan;
  }

  private async finish(siteId: string, fileId: string, result: IMediaLibraryView): Promise<IMediaLibraryView> {
    let outcome: IMediaLibraryView['referenceUpdate'];
    let view = result;

    try {
      await this.library.store.withReferenceUpdate!(siteId, fileId, async (entry) => {
        view = this.library.view(siteId, entry);
        const prefix = this.library.values.publicPath + '/';
        const paths = (entry.file.pendingReferences ?? []).map(({ from, key }) => {
          const to = view.files[0]!.outputs.find((item) => item.key === key)?.url;

          fileRequirement(from.startsWith(prefix) && to, 'Invalid pending file reference');

          return { from, to };
        }).filter(({ from, to }) => from !== to);

        for (const { from } of paths) {
          const owner = await this.library.store.pathOwner!(siteId, decodeURIComponent(from.slice(prefix.length)));

          if (owner && owner !== fileId) {
            outcome = 'AddressInUse';

            return false;
          }
        }

        if (paths.length) {
          await this.references!.replace(siteId, paths);
          await this.publication!.execute({ siteId, paths });
        }

        return true;
      });
    } catch {
      outcome = 'Pending';
    }

    if (outcome) {
      return { ...view, referenceUpdate: outcome };
    }

    return {
      ...view,
      files: view.files.map((file) => {
        const updated = { ...file };

        delete updated.referencesPending;

        return updated;
      }),
    };
  }
}
