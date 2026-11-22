import type { IncomingMessage } from 'node:http';

import { MAX_DOCUMENT_BYTES, MAX_IMAGE_BYTES } from '../../../../domain/media/media-policy.js';
import { MediaValidationError, MediaValidationIssue } from '../../../../domain/media/media-validation.error.js';
import type { IBinaryContent } from '../../../../domain/shared/binary-content.js';
import { HttpFailure } from '../shared/admin-http.boundary.js';

export interface IAdminFileUpload {
  readonly metadata: Record<string, unknown>;
  readonly content: IBinaryContent;
}

export function readFileUpload(request: IncomingMessage): IAdminFileUpload {
  if (
    request.headers['content-type']?.toLowerCase() !== 'application/octet-stream'
    || request.headers['content-encoding'] !== undefined
  ) {
    throw new HttpFailure(415, 'Unencoded binary upload required');
  }

  const metadata = request.headers['x-zarya-file-metadata'];
  const length = request.headers['content-length'];

  if (
    typeof metadata !== 'string'
    || metadata.length > 8192
    || request.rawHeaders.filter((value, index) => index % 2 === 0
      && value.toLowerCase() === 'x-zarya-file-metadata').length !== 1
    || typeof length !== 'string'
    || !/^(0|[1-9][0-9]*)$/.test(length)
  ) {
    throw new HttpFailure(400, 'Bounded upload metadata and an explicit byte length are required');
  }

  let body: unknown;

  try {
    body = JSON.parse(decodeURIComponent(metadata));
  } catch {
    throw new HttpFailure(400, 'Invalid file metadata');
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpFailure(400, 'Invalid file metadata');
  }

  const fields = Object.fromEntries(Object.entries(body));
  const image = typeof fields.filename === 'string' && /\.(?:jpe?g|png|webp|avif|svg|ico)$/i.test(fields.filename);
  const maximumBytes = image ? MAX_IMAGE_BYTES : MAX_DOCUMENT_BYTES;
  const byteSize = Number(length);
  const tooLarge = (): never => {
    throw new MediaValidationError(image ? MediaValidationIssue.ImageTooLarge : MediaValidationIssue.DocumentTooLarge);
  };

  if (!Number.isSafeInteger(byteSize) || byteSize > maximumBytes) {
    tooLarge();
  }
  if (!byteSize) {
    throw new MediaValidationError(MediaValidationIssue.Empty);
  }

  return {
    metadata: fields,
    content: {
      byteSize,
      mimeType: 'application/octet-stream',
      bytes: (async function* () {
        let received = 0;

        for await (const chunk of request) {
          if (!(chunk instanceof Uint8Array)) {
            throw new HttpFailure(400, 'Invalid upload chunk');
          }
          received += chunk.byteLength;

          if (received > maximumBytes) {
            tooLarge();
          }
          if (received > byteSize) {
            throw new MediaValidationError(MediaValidationIssue.ContentMismatch);
          }
          yield chunk;
        }

        if (received !== byteSize) {
          throw new MediaValidationError(MediaValidationIssue.ContentMismatch);
        }
      })(),
    },
  };
}
