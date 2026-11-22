import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  PageDelivery, ResolutionMethod, ResolutionOutcome, ResolutionRepresentation,
} from '../../../../domain/diagnostics/page-resolution.js';
import type { IPageResolutionSink } from '../../../../ports/outbound/diagnostics/resolution-observation.port.js';
import { AdminHttpBoundary, HttpFailure, type IAdminHttpSettings, sendJson } from '../shared/admin-http.boundary.js';
import type { IPageResolutionOperationsFactory } from './page-resolution-operations.factory.js';

export class PageResolutionController {
  private readonly boundary: AdminHttpBoundary;

  constructor(settings: IAdminHttpSettings, private readonly operations: IPageResolutionOperationsFactory,
    private readonly sink: IPageResolutionSink) {
    this.boundary = new AdminHttpBoundary(settings);
  }

  canHandle(pathname: string): boolean {
    return /^\/api\/admin\/sites\/[^/]+\/page-resolutions(?:\/|$)/.test(pathname);
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const target = this.boundary.check(request, response);
      const operation = await this.operations.forSession(this.boundary.token(request));
      const url = new URL(target, this.boundary.origin);
      const match = /^\/api\/admin\/sites\/([A-Za-z0-9_-]{1,128})\/page-resolutions$/.exec(url.pathname);

      if (!match) {
        throw new HttpFailure(404, 'NotFound');
      }
      if (request.method !== 'GET') {
        response.setHeader('Allow',
          'GET');
        throw new HttpFailure(405,
          'Method not allowed');
      }

      const allowed = ['from', 'to', 'cmsVersion', 'delivery', 'representation', 'method', 'outcome'];

      for (const key of url.searchParams.keys()) {
        if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1) {
          throw new HttpFailure(400, 'Validation');
        }
      }
      const choice = <T extends string>(name: string, values: readonly T[]): T | null | undefined => {
        const value = url.searchParams.get(name);

        if (value === null) {
          return undefined;
        }
        if (value === 'all') {
          return null;
        }

        const found = values.find((choice) => choice === value);

        if (found === undefined) {
          throw new HttpFailure(400, 'Validation');
        }

        return found;
      };
      const siteId = match[1]!;
      const result = await operation.execute({
        siteId,
        ...(url.searchParams.has('from') ? { from: url.searchParams.get('from')! } : {}),
        ...(url.searchParams.has('to') ? { to: url.searchParams.get('to')! } : {}),
        ...(url.searchParams.has('cmsVersion') ? { cmsVersion: url.searchParams.get('cmsVersion')! } : {}),
        ...(url.searchParams.has('delivery') ? {
          delivery: choice('delivery',
            Object.values(PageDelivery)) ?? null,
        } : {}),
        ...(url.searchParams.has('representation') ? {
          representation: choice('representation',
            Object.values(ResolutionRepresentation)) ?? null,
        } : {}),
        ...(url.searchParams.has('method') ? {
          method: choice('method',
            Object.values(ResolutionMethod)) ?? null,
        } : {}),
        ...(url.searchParams.has('outcome') ? {
          outcome: choice('outcome',
            Object.values(ResolutionOutcome)) ?? null,
        } : {}),
      });

      sendJson(response, 200, { ...result, diagnostics: this.sink.status(siteId) });
    } catch (error) {
      this.boundary.failure(response, error);
    }
  }
}
