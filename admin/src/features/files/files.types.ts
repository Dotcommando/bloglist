export enum ImageUploadMode { Original = 'Original', Responsive = 'Responsive' }

export enum MediaRoot { Images = 'images', Files = 'files' }

export enum FileValidationIssue {
  InvalidName = 'FileInvalidName', NameTooLong = 'FileNameTooLong', ReservedName = 'FileReservedName',
  Empty = 'FileEmpty', ImageTooLarge = 'FileImageTooLarge', DocumentTooLarge = 'FileDocumentTooLarge',
  UnsupportedFormat = 'FileUnsupportedFormat', ContentMismatch = 'FileContentMismatch',
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
