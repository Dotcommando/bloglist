import type { IMediaUsage } from '../../../domain/media/file-library.js';
import type { ILibraryFile } from '../media/file-library.port.js';

/** Existing developer API data shape, including administration navigation. */
export interface ICmsMediaUsage extends Omit<IMediaUsage, 'target'> {
  readonly editorPath: string;
}

export interface ICmsFileUsages {
  execute(input: ILibraryFile): Promise<{ readonly version: string; readonly usages: readonly ICmsMediaUsage[] }>;
}
