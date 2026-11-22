import type { IncomingMessage, ServerResponse } from 'node:http';

import { TemplateSourceKind } from '../../../../domain/publication/render-plan.js';
import { parseElementParameters } from '../../../../domain/rendering/parameter-contract.policy.js';
import { validateElementContent } from '../../../../domain/rendering/rendering-element.js';
import { parseSnippetSource } from '../../../../domain/rendering/snippet-source.policy.js';
import {
  AdminHttpBoundary, HttpFailure, type IAdminHttpSettings, readAccessGroupId, readAdminBody, sendJson,
} from '../shared/admin-http.boundary.js';
import { requestAllowsSnippetRepublication, requestContentAccess } from '../shared/admin-request-gate.js';
import type { IAdminRenderingOperationFactory } from './admin-rendering-operations.factory.js';

const jsonLdRoute = /^\/api\/admin\/sites\/([A-Za-z0-9_-]{1,128})\/pages\/([A-Za-z0-9_-]{1,128})\/json-ld-(preview|published)$/;

const markdownRoute = /^\/api\/admin\/sites\/([A-Za-z0-9_-]{1,128})\/pages\/([A-Za-z0-9_-]{1,128})\/markdown-(preview|published)$/;

const route = /^\/api\/admin\/sites\/([A-Za-z0-9_-]{1,128})\/(templates|chunks|snippets)(?:\/((?:[A-Za-z][A-Za-z0-9_]{0,127}|[1-9][0-9]{0,18}))(\/preview)?)?$/;

function text(body: Record<string, unknown>, key: string): string {
  const value = body[key];

  if (typeof value !== 'string') {
    throw new HttpFailure(400, 'Expected field: ' + key);
  }

  return value;
}

export class AdminRenderingController {
  private readonly boundary: AdminHttpBoundary;

  constructor(settings: IAdminHttpSettings, private readonly operations: IAdminRenderingOperationFactory) {
    this.boundary = new AdminHttpBoundary(settings);
  }

  canHandle(pathname: string): boolean {
    return route.test(pathname) || markdownRoute.test(pathname) || jsonLdRoute.test(pathname);
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const target = this.boundary.check(request, response);
      const jsonLd = jsonLdRoute.exec(target);

      if (jsonLd) {
        this.boundary.method(request, response, 'GET');
        const operations = this.operations.forSession(this.boundary.token(request));
        const operation = jsonLd[3] === 'published' ? operations.inspectJsonLdPublished : operations.inspectJsonLdDraft;
        const result = await operation.execute({ siteId: jsonLd[1]!, pageId: jsonLd[2]! });

        response.setHeader('X-Robots-Tag', 'noindex, nofollow');
        sendJson(response, 200, result);

        return;
      }

      const markdown = markdownRoute.exec(target);

      if (markdown) {
        this.boundary.method(request, response, 'GET');
        const operations = this.operations.forSession(this.boundary.token(request));
        const operation = markdown[3] === 'published'
          ? operations.previewMarkdownPublished : operations.previewMarkdownDraft;
        const result = await operation.execute({ siteId: markdown[1]!, pageId: markdown[2]! });

        response.setHeader('X-Robots-Tag', 'noindex, nofollow');
        sendJson(response, 200, result);

        return;
      }

      const match = route.exec(target);

      if (!match) {
        throw new HttpFailure(400, 'Invalid element route');
      }

      const operations = this.operations.forSession(this.boundary.token(request));
      const authority = requestContentAccess(request);
      const access = authority ? { authority } : {};
      const siteId = match[1]!;
      const kind = match[2] === 'templates' ? TemplateSourceKind.Template
        : match[2] === 'chunks' ? TemplateSourceKind.Chunk : TemplateSourceKind.Snippet;
      const key = match[3];

      if (request.method === 'GET' && !match[4]) {
        sendJson(response, 200, key ? await operations.get.execute({ siteId, kind, key, ...access })
          : { items: await operations.list.execute({ siteId, kind, ...access }) });

        return;
      }
      this.boundary.method(request, response, 'POST');
      const body = await readAdminBody(request, match[4] ? 8192 : 2 * 1024 * 1024);
      const snippetUpdate = kind === TemplateSourceKind.Snippet && Boolean(key) && !match[4];
      const allowed = match[4] ? ['pageId', 'expectedVersion']
        : ['name', 'html', 'css', 'browserTypeScript', 'parameters',
          ...(kind === TemplateSourceKind.Snippet ? ['snippet'] : []),
          ...(snippetUpdate ? ['draftOnly'] : []),
          ...(key ? ['expectedVersion'] : kind !== TemplateSourceKind.Template ? ['accessGroupId'] : [])];

      if (Object.keys(body).some((key) => !allowed.includes(key))) {
        throw new HttpFailure(400, 'Unknown fields');
      }
      if (match[4] && key) {
        const result = await operations.preview.execute({
          siteId,
          kind,
          key,
          pageId: text(body, 'pageId'),
          expectedVersion: text(body, 'expectedVersion'),
        });

        sendJson(response, 200, { previewId: result.previewId, url: result.url });

        return;
      }
      if (body.draftOnly !== undefined && typeof body.draftOnly !== 'boolean') {
        throw new HttpFailure(400, 'Invalid draftOnly option');
      }

      const browserTypeScript = body.browserTypeScript;

      if (browserTypeScript !== null && typeof browserTypeScript !== 'string') {
        throw new HttpFailure(400, 'Invalid script');
      }

      const content = {
        name: text(body, 'name'),
        html: text(body, 'html'),
        css: text(body, 'css'),
        browserTypeScript,
        parameters: parseElementParameters(body.parameters),
        ...(kind === TemplateSourceKind.Snippet ? { snippet: parseSnippetSource(body.snippet) } : {}),
      };

      validateElementContent(content);
      const accessGroupId = readAccessGroupId(body.accessGroupId);
      const saved = key ? await operations.update.execute({
        siteId,
        kind,
        key,
        ...content,
        ...access,
        ...(snippetUpdate && (body.draftOnly === true || !requestAllowsSnippetRepublication(request))
          ? { draftOnly: true } : {}),
        expectedVersion: text(body, 'expectedVersion'),
      })
        : await operations.create.execute({
          siteId,
          kind,
          ...content,
          ...access,
          ...(accessGroupId === undefined ? {} : { accessGroupId }),
        });

      sendJson(response, key ? 200 : 201, saved);
    } catch (error) {
      this.boundary.failure(response, error instanceof RangeError ? new HttpFailure(400, 'Validation') : error);
    }
  }
}
