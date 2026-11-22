import type { IncomingMessage, ServerResponse } from 'node:http';

import { ImageUploadMode, MediaRoot } from '../../../../domain/media/file-library.js';
import { MediaValidationError, MediaValidationIssue } from '../../../../domain/media/media-validation.error.js';
import { adminMediaUsage } from '../../shared/admin-media-usage.dto.js';
import { writeFileResponse } from '../../shared/file-response.js';
import {
  AdminHttpBoundary, HttpFailure, type IAdminHttpSettings, readAdminBody, sendJson,
} from '../shared/admin-http.boundary.js';
import type { IAdminFileOperationFactory } from './admin-file-operations.factory.js';
import { readFileUpload } from './admin-file-upload.js';

const route = /^\/api\/admin\/sites\/([A-Za-z0-9_-]{1,128})\/files(?:\/([A-Za-z0-9_-]{1,128})(?:\/(usages|content|move|delete|change))?)?$/;

function text(body: Record<string, unknown>, key: string): string {
  if (typeof body[key] !== 'string') {
    throw new HttpFailure(400, 'Expected ' + key);
  }

  return body[key];
}

function folder(body: Record<string, unknown>, key: string): string | null {
  if (body[key] === null) {
    return null;
  }

  const id = text(body, key);

  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    throw new HttpFailure(400, 'Invalid folder identity');
  }

  return id;
}

export class AdminFilesController {
  private readonly boundary: AdminHttpBoundary;

  constructor(settings: IAdminHttpSettings, private readonly operations: IAdminFileOperationFactory) {
    this.boundary = new AdminHttpBoundary(settings);
  }

  canHandle(pathname: string): boolean {
    return route.test(pathname);
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const target = this.boundary.check(request, response);
      const url = new URL(target, this.boundary.origin);
      const match = route.exec(url.pathname);

      if (!match) {
        throw new HttpFailure(404, 'File route not found');
      }

      const operations = this.operations.forSession(this.boundary.token(request));
      const siteId = match[1]!;
      const fileId = match[2];
      const action = match[3];

      if (request.method === 'GET') {
        if (!fileId && !url.search) {
          sendJson(response, 200, await operations.list.execute({ siteId }));
        } else if (
          fileId
          && action === 'usages'
          && [...url.searchParams.keys()].every((key) => key === 'expectedVersion')
        ) {
          const expectedVersion = url.searchParams.get('expectedVersion');

          if (!expectedVersion) {
            throw new HttpFailure(400, 'Metadata version required');
          }

          const review = await operations.usages.execute({ siteId, fileId, expectedVersion });
          const readable = await operations.readableUsageTargets(siteId, review.usages.map((usage) => usage.target));

          sendJson(response, 200, {
            version: review.version,
            usages: review.usages.map((usage) => ({
              ...adminMediaUsage(siteId, usage),
              ...(readable.has(usage.target.kind + ':' + usage.target.id) ? { readable: true } : {}),
            })),
          });
        } else if (
          fileId
          && action === 'content'
          && [...url.searchParams.keys()].every((key) => key === 'key' || key === 'v')
        ) {
          const key = url.searchParams.get('key') ?? 'original';
          const { content, filename } = await operations.readContent.execute({ siteId, fileId, key });

          response.setHeader('Content-Type', content.mimeType);
          response.setHeader('Content-Length', content.byteSize);
          response.setHeader('Content-Disposition', "inline; filename*=UTF-8''" + encodeURIComponent(filename));
          response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");

          await writeFileResponse(response, content.bytes);
          response.end();
        } else {
          throw new HttpFailure(400, 'Invalid file query');
        }

        return;
      }
      this.boundary.method(request, response, 'POST');

      if (url.search) {
        throw new HttpFailure(400, 'Unexpected query');
      }

      const upload = !fileId || action === 'change';
      const uploaded = upload ? readFileUpload(request) : null;
      const body = uploaded?.metadata ?? await readAdminBody(request, 16384);
      const allowed = !fileId ? ['expectedVersion', 'filename', 'folderId', 'mode']
        : fileId === 'folders' ? ['expectedVersion', 'name', 'parentId', 'root']
          : fileId === 'reconcile' ? []
            : action === 'change' ? ['expectedVersion', 'filename']
              : action === 'move' ? ['expectedVersion', 'folderId', 'name', 'updateReferences']
                : action === 'delete' ? ['expectedVersion', 'force'] : [];

      if (Object.keys(body).some((key) => !allowed.includes(key))) {
        throw new HttpFailure(400, 'Unknown file fields');
      }
      if (fileId === 'reconcile' && !action) {
        sendJson(response, 200, await operations.reconcile.execute({ siteId }));

        return;
      }
      if (fileId && action === 'delete' && body.force === true) {
        sendJson(response, 200, await operations.delete.execute({ siteId, fileId, force: true }));

        return;
      }

      const expectedVersion = text(body, 'expectedVersion');
      const scope = { siteId, expectedVersion };
      let result;

      if (fileId === 'folders' && !action) {
        const root = body.root ?? MediaRoot.Images;

        if (root !== MediaRoot.Images && root !== MediaRoot.Files) {
          throw new HttpFailure(400, 'Invalid file root');
        }
        result = await operations.createFolder.execute({
          ...scope,
          root,
          name: text(body,
            'name'),
          parentId: folder(body,
            'parentId'),
        });
      } else if (!fileId) {
        const mode = text(body, 'mode');

        if (mode !== ImageUploadMode.Original && mode !== ImageUploadMode.Responsive) {
          throw new HttpFailure(400, 'Invalid upload mode');
        }
        result = await operations.upload.execute({
          ...scope,
          filename: text(body, 'filename'),
          folderId: folder(body, 'folderId'),
          mode,
          content: uploaded!.content,
        });
      } else if (action === 'change') {
        result = await operations.changeImage.execute({
          ...scope,
          fileId,
          filename: text(body,
            'filename'),
          content: uploaded!.content,
        });
      } else if (action === 'move') {
        if (body.updateReferences !== undefined && typeof body.updateReferences !== 'boolean') {
          throw new HttpFailure(400, 'Expected updateReferences boolean');
        }
        result = await operations.move.execute({
          ...scope,
          fileId,
          updateReferences: body.updateReferences === true,
          name: text(body,
            'name'),
          folderId: folder(body,
            'folderId'),
        });
      } else if (action === 'delete') {
        if (typeof body.force !== 'boolean') {
          throw new HttpFailure(400, 'Expected force boolean');
        }
        result = await operations.delete.execute({ ...scope, fileId, force: body.force });
      } else {
        throw new HttpFailure(404, 'File operation not found');
      }
      sendJson(response, 200, result);
    } catch (error) {
      if (response.headersSent) {
        response.destroy();
      } else if (error instanceof MediaValidationError) {
        const tooLarge = error.issue === MediaValidationIssue.ImageTooLarge
          || error.issue === MediaValidationIssue.DocumentTooLarge;

        sendJson(response, tooLarge ? 413 : 400, { error: error.issue });
      } else {
        this.boundary.failure(response, error instanceof RangeError ? new HttpFailure(400, 'Validation') : error);
      }
    }
  }
}
