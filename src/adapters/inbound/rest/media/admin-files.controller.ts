import type { IncomingMessage, ServerResponse } from 'node:http';

import { ImageUploadMode, MediaRoot } from '../../../../domain/media/file-library.js';
import { type IMediaBrowseQuery, MediaSortField } from '../../../../domain/media/media-browser.js';
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

function browseQuery(siteId: string, params: URLSearchParams): IMediaBrowseQuery {
  const allowed = new Set([
    'root', 'folderId', 'search', 'recursive', 'sort', 'descending', 'page', 'pageSize', 'mimeTypes', 'foldersOnly',
  ]);
  const root = params.get('root') ?? MediaRoot.Images;
  const sort = Object.values(MediaSortField).find((field) => field === (params.get('sort') ?? MediaSortField.Name));
  const folderId = params.get('folderId');
  const recursive = params.get('recursive') ?? '0';
  const descending = params.get('descending') ?? '0';
  const foldersOnly = params.get('foldersOnly') ?? '0';

  if (
    [...params.keys()].some((name) => !allowed.has(name) || params.getAll(name).length !== 1)
    || root !== MediaRoot.Images
    && root !== MediaRoot.Files
    || !sort
    || folderId !== null
    && !/^[A-Za-z0-9_-]{1,128}$/.test(folderId)
    || !['0', '1'].includes(recursive)
    || !['0', '1'].includes(descending)
    || !['0', '1'].includes(foldersOnly)
  ) {
    throw new HttpFailure(400, 'Invalid media browse query');
  }

  return {
    siteId,
    root,
    folderId,
    sort,
    search: (params.get('search') ?? '').trim(),
    recursive: recursive === '1',
    descending: descending === '1',
    foldersOnly: foldersOnly === '1',
    page: Number(params.get('page') ?? '1'),
    pageSize: Number(params.get('pageSize') ?? '25'),
    ...(params.has('mimeTypes') ? { mimeTypes: params.get('mimeTypes')!.split(',') } : {}),
  };
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
        } else if (!fileId && url.searchParams.has('fileId')) {
          const requested = url.searchParams.get('fileId') ?? '';

          if (url.searchParams.size !== 1 || !/^[A-Za-z0-9_-]{1,128}$/.test(requested)) {
            throw new HttpFailure(400, 'Invalid media file identity');
          }
          sendJson(response, 200, await operations.browse.file({ siteId, fileId: requested }));
        } else if (!fileId) {
          sendJson(response, 200, await operations.browse.execute(browseQuery(siteId, url.searchParams)));
        } else if (
          fileId
          && action === 'usages'
          && [...url.searchParams.keys()].every((key) => key === 'expectedVersion' || key === 'expectedFileVersion')
        ) {
          const expectedVersion = url.searchParams.get('expectedVersion');
          const expectedFileVersion = url.searchParams.get('expectedFileVersion');

          if (!expectedVersion) {
            throw new HttpFailure(400, 'Metadata version required');
          }

          const review = await operations.usages.execute({
            siteId,
            fileId,
            expectedVersion,
            ...(expectedFileVersion === null ? {} : { expectedFileVersion }),
          });
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

      if (
        fileId
        && action === 'move'
        && body.retryReferences === true
        && Object.keys(body).length === 1
        && operations.move.retry
      ) {
        sendJson(response, 200, await operations.move.retry({ siteId, fileId }));

        return;
      }

      const allowed = !fileId ? ['expectedVersion', 'filename', 'folderId', 'mode', 'mimeTypes']
        : fileId === 'folders' ? ['expectedVersion', 'name', 'parentId', 'root']
          : fileId === 'reconcile' ? []
            : action === 'change' ? ['expectedVersion', 'expectedFileVersion', 'filename']
              : action === 'move' ? ['expectedVersion', 'expectedFileVersion', 'folderId', 'name', 'updateReferences']
                : action === 'delete' ? ['expectedVersion', 'expectedFileVersion', 'force'] : [];

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
      const scope = {
        siteId,
        expectedVersion,
        ...(body.expectedFileVersion === undefined
          ? {} : { expectedFileVersion: text(body, 'expectedFileVersion') }),
      };
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
        const { mimeTypes } = body;

        if (mode !== ImageUploadMode.Original && mode !== ImageUploadMode.Responsive) {
          throw new HttpFailure(400, 'Invalid upload mode');
        }
        if (
          mimeTypes !== undefined
          && (!Array.isArray(mimeTypes)
          || mimeTypes.length > 25
          || !mimeTypes.every((type: unknown) => typeof type === 'string' && /^[\w.+-]+\/[\w.+-]+$/.test(type)))
        ) {
          throw new HttpFailure(400, 'Invalid accepted file types');
        }
        result = await operations.upload.execute({
          ...scope,
          filename: text(body, 'filename'),
          folderId: folder(body, 'folderId'),
          mode,
          ...(mimeTypes === undefined ? {} : { mimeTypes }),
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
