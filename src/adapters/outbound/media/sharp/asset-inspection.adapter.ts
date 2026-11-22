import path from 'node:path';

import { fileTypeFromFile } from 'file-type';

import type { IImageDimensions } from '../../../../domain/media/asset.js';
import { MAX_DOCUMENT_BYTES, MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS } from '../../../../domain/media/media-policy.js';
import { MediaValidationError, MediaValidationIssue } from '../../../../domain/media/media-validation.error.js';
import type { IBinaryContent } from '../../../../domain/shared/binary-content.js';
import type { IAssetInspectionPort, IInspectedAsset } from '../../../../ports/outbound/media/asset-inspection.port.js';
import { BinaryFileLimitError, fileContent, stageFile } from '../../storage/files/binary-file.js';
import {
  containsFileBytes, iconDimensions, validateCsvFile, validateJsonFile, validateSvgFile,
} from './file-content-validation.js';
import sharp from './sharp-file-runtime.js';

export const ASSET_MIME_TYPES: Readonly<Record<string, string>> = Object.freeze({
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  woff2: 'font/woff2',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  csv: 'text/csv',
  json: 'application/json',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
});

export class AssetInspectionAdapter implements IAssetInspectionPort {
  async inspect(filename: string, content: IBinaryContent): Promise<IInspectedAsset> {
    if (
      !filename.trim()
      || filename.length > 255
      || /[\\/]/.test(filename)
      || Array.from(filename).some((char) => char.charCodeAt(0) < 32)
    ) {
      throw new MediaValidationError(MediaValidationIssue.InvalidName, 'Invalid display filename');
    }

    const ext = path.extname(filename).slice(1).toLowerCase();
    const mimeType = ASSET_MIME_TYPES[ext];

    if (!mimeType) {
      throw new MediaValidationError(MediaValidationIssue.UnsupportedFormat, 'Unsupported file extension');
    }

    const limit = mimeType.startsWith('image/') ? MAX_IMAGE_BYTES : MAX_DOCUMENT_BYTES;
    let staged: Awaited<ReturnType<typeof stageFile>>;

    try {
      staged = await stageFile(content, limit);
    } catch (error) {
      if (error instanceof BinaryFileLimitError) {
        throw new MediaValidationError(mimeType.startsWith('image/')
          ? MediaValidationIssue.ImageTooLarge : MediaValidationIssue.DocumentTooLarge, 'File exceeds the byte limit');
      }
      throw error;
    }

    try {
      if (!staged.byteSize) {
        throw new MediaValidationError(MediaValidationIssue.Empty);
      }

      let dimensions: IImageDimensions | undefined;

      if (ext === 'svg') {
        await validateSvgFile(staged.filename);
        const info = await sharp(staged.filename, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'error' }).metadata();

        if (info.width && info.height) {
          dimensions = { width: info.width, height: info.height, aspectRatio: info.width / info.height };
        }
      } else if (ext === 'json') {
        await validateJsonFile(staged.filename);
      } else if (ext === 'csv') {
        await validateCsvFile(staged.filename);
      } else {
        const detected = await fileTypeFromFile(staged.filename);
        const legacyOffice = (ext === 'doc' || ext === 'xls') && detected?.mime === 'application/x-cfb'
          && await containsFileBytes(staged.filename, Buffer.from(ext === 'doc' ? 'WordDocument' : 'Workbook',
            'utf16le'));
        const ico = ext === 'ico' && detected?.ext === 'ico';

        if (detected?.mime !== mimeType && !legacyOffice && !ico) {
          throw new MediaValidationError(MediaValidationIssue.ContentMismatch);
        }
        if (mimeType.startsWith('image/') && ext !== 'ico') {
          const info = await sharp(staged.filename, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'error' }).metadata();

          if (!info.width || !info.height || (info.pages ?? 1) > 1) {
            throw new RangeError('Invalid or animated image');
          }

          const swapped = (info.orientation ?? 0) >= 5 && (info.orientation ?? 0) <= 8;
          const width = swapped ? info.height : info.width;
          const height = swapped ? info.width : info.height;

          dimensions = { width, height, aspectRatio: width / height };
        }
        if (ext === 'ico') {
          dimensions = await iconDimensions(staged.filename, staged.byteSize);
        }
      }

      return {
        content: fileContent(staged.filename, staged.byteSize, mimeType),
        checksum: staged.checksum,
        ...(dimensions ? { dimensions } : {}),
        dispose: staged.dispose,
      };
    } catch (error) {
      await staged.dispose();

      if (
        error instanceof MediaValidationError
        || error instanceof Error
        && 'code' in error
        && typeof error.code === 'string'
        && 'syscall' in error
        && typeof error.syscall === 'string'
      ) {
        throw error;
      }
      throw new MediaValidationError(mimeType.startsWith('image/')
        ? MediaValidationIssue.ImageContent : MediaValidationIssue.ContentMismatch);
    }
  }
}
