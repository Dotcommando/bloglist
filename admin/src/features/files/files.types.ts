export enum ImageUploadMode { Original = 'Original', Responsive = 'Responsive' }

export enum MediaRoot { Images = 'images', Files = 'files' }

export enum FileValidationIssue {
  InvalidName = 'FileInvalidName', NameTooLong = 'FileNameTooLong', ReservedName = 'FileReservedName',
  Empty = 'FileEmpty', ImageTooLarge = 'FileImageTooLarge', DocumentTooLarge = 'FileDocumentTooLarge',
  UnsupportedFormat = 'FileUnsupportedFormat', ContentMismatch = 'FileContentMismatch',
  PickerType = 'FilePickerType',
  CsvEncoding = 'FileCsvEncoding', CsvContent = 'FileCsvContent', JsonContent = 'FileJsonContent',
  ImageContent = 'FileImageContent', ReadFailed = 'FileReadFailed',
}

export function fileRoot(file: Pick<ISiteFile, 'mimeType'>): MediaRoot {
  return file.mimeType.startsWith('image/') ? MediaRoot.Images : MediaRoot.Files;
}

export enum FileUsageGroup { Content = 'Content', OpenGraph = 'OpenGraph', Templates = 'Templates' }

export interface IFileDimensions { readonly width: number; readonly height: number; readonly aspectRatio: number; }

export interface IFileOutput {
  // Older library responses may omit output sizes.
  readonly byteSize?: number | null;
  readonly key: string;
  readonly url: string;
  readonly mimeType: string;
  readonly dimensions: IFileDimensions | null;
}

export interface ISiteFile {
  readonly fileId: string;
  readonly folderId: string | null;
  readonly name: string;
  readonly mode: ImageUploadMode;
  readonly hasVariants: boolean;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly assetVersion?: string;
  readonly revision?: string;
  readonly referencesPending?: boolean;
  readonly originalDimensions: IFileDimensions | null;
  readonly outputs: readonly IFileOutput[];
}

export interface IFileFolder {
  readonly folderId: string; readonly parentId: string | null; readonly name: string; readonly root?: MediaRoot;
}

export interface IFileLibrary {
  readonly version: string;
  readonly pending: boolean;
  readonly folders: readonly IFileFolder[];
  readonly files: readonly ISiteFile[];
  readonly referenceUpdate?: 'Pending' | 'AddressInUse';
}

export function mergeFiles(current: readonly ISiteFile[], updates: readonly ISiteFile[]): readonly ISiteFile[] {
  const files = new Map(current.map((file) => [file.fileId, file]));

  for (const file of updates) {
    files.set(file.fileId, file);
  }

  return [...files.values()];
}

export enum FileSort { Name = 'name', Created = 'created', Updated = 'updated', Type = 'type', Size = 'size' }

export interface IFileBrowseQuery {
  readonly root: MediaRoot;
  readonly folderId: string | null;
  readonly search: string;
  readonly recursive: boolean;
  readonly sort: FileSort;
  readonly descending: boolean;
  readonly page: number;
  readonly pageSize: number;
  readonly mimeTypes?: readonly string[];
  readonly foldersOnly?: boolean;
}

export interface IFileBrowsePage extends IFileLibrary {
  readonly total: number;
  readonly folderTotal: number;
  readonly fileTotal: number;
  readonly breadcrumbs: readonly IFileFolder[];
  readonly paths: Readonly<Record<string, string>>;
  readonly timeZone?: string;
}

export interface IFileUsage {
  readonly group: FileUsageGroup;
  readonly title: string;
  readonly field: string;
  readonly editorPath: string;
  readonly state: string;
  readonly readable: boolean;
}

export interface IFileReview { readonly version: string; readonly usages: readonly IFileUsage[]; }
