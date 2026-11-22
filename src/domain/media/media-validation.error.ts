import { BusinessError, BusinessErrorCode } from '../shared/business-error.js';

export enum MediaValidationIssue {
  InvalidName = 'FileInvalidName',
  NameTooLong = 'FileNameTooLong',
  ReservedName = 'FileReservedName',
  Empty = 'FileEmpty',
  ImageTooLarge = 'FileImageTooLarge',
  DocumentTooLarge = 'FileDocumentTooLarge',
  UnsupportedFormat = 'FileUnsupportedFormat',
  ContentMismatch = 'FileContentMismatch',
  CsvEncoding = 'FileCsvEncoding',
  CsvContent = 'FileCsvContent',
  JsonContent = 'FileJsonContent',
  ImageContent = 'FileImageContent',
}

export class MediaValidationError extends BusinessError {
  constructor(readonly issue: MediaValidationIssue, message = 'Invalid media file') {
    super(BusinessErrorCode.Validation, message);
  }
}
