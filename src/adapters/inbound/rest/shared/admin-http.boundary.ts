import type { IncomingMessage, ServerResponse } from 'node:http';

import { AdminLoginThrottledError } from '../../../../domain/admin-auth/admin-auth.policy.js';
import { JsonLdValidationError } from '../../../../domain/json-ld/json-ld-validation.error.js';
import { TemplateValidationError } from '../../../../domain/publication/template-validation.error.js';
import { BusinessError, BusinessErrorCode } from '../../../../domain/shared/business-error.js';
import { SiteLocalAddressInUseError } from '../../../../domain/sites/site-local-address-in-use.error.js';

export interface IAdminHttpSettings {
  readonly origin: string;
  readonly currentOrigin?: () => string;
  readonly cookieVersion?: () => string;
}

export const ADMIN_AUTH_COOKIE = 'zarya_admin_session';

export const ADMIN_UI_AUTH_COOKIE = 'zarya_admin_ui_session';

export class HttpFailure extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export function readAccessGroupId(value: unknown): string | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new HttpFailure(400, 'Invalid access group');
  }

  return value;
}

export function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
}

export async function readAdminBody(request: IncomingMessage, maximumBytes = 8192): Promise<Record<string, unknown>> {
  if (
    request.headers['content-type']?.toLowerCase() !== 'application/json'
    && request.headers['content-type']?.toLowerCase() !== 'application/json; charset=utf-8'
  ) {
    throw new HttpFailure(415, 'JSON content type required');
  }
  if (request.headers['content-encoding'] !== undefined) {
    throw new HttpFailure(415, 'Encoded bodies are unsupported');
  }

  let size = 0;
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    if (!Buffer.isBuffer(chunk)) {
      throw new HttpFailure(400, 'Invalid request body');
    }
    size += chunk.length;

    if (size > maximumBytes) {
      throw new HttpFailure(413, 'Request body exceeds its limit');
    }
    chunks.push(chunk);
  }

  try {
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));

    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error();
    }

    return Object.fromEntries(Object.entries(value));
  } catch {
    throw new HttpFailure(400, 'Invalid JSON body');
  }
}

export class AdminHttpBoundary {
  constructor(private readonly settings: IAdminHttpSettings) {}

  get origin(): URL {
    return new URL(this.settings.currentOrigin?.() ?? this.settings.origin);
  }

  check(request: IncomingMessage, response: ServerResponse): string {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');

    for (const name of ['host', 'origin', 'cookie', 'x-zarya-admin', 'sec-fetch-site']) {
      if (request.rawHeaders.filter((value, i) => i % 2 === 0 && value.toLowerCase() === name).length > 1) {
        throw new HttpFailure(400, 'Duplicate request header');
      }
    }

    if (request.headers.host?.toLowerCase() !== this.origin.host) {
      throw new HttpFailure(403, 'Untrusted host');
    }

    const origin = request.headers.origin;
    const site = request.headers['sec-fetch-site'];

    if (
      origin !== undefined
      && origin !== this.origin.origin
      || site !== undefined
      && site !== 'same-origin'
      && site !== 'none'
    ) {
      throw new HttpFailure(403, 'Untrusted origin');
    }
    if (
      request.method !== 'GET'
      && request.method !== 'HEAD'
      && (origin !== this.origin.origin
      || request.headers['x-zarya-admin'] !== '1')
    ) {
      throw new HttpFailure(403, 'Same-origin request headers required');
    }

    const target = request.url ?? '';

    if (
      target.length > 4096
      || !target.startsWith('/')
      || target.startsWith('//')
      || /[\\#%]/.test(target.split('?')[0] ?? '')
    ) {
      throw new HttpFailure(400, 'Invalid request target');
    }

    return target;
  }

  method(request: IncomingMessage, response: ServerResponse, method: string): void {
    if (request.method !== method) {
      response.setHeader('Allow', method);
      throw new HttpFailure(405, 'Method not allowed');
    }
  }

  token(request: IncomingMessage, name = ADMIN_AUTH_COOKIE): string | null {
    const cookie = request.headers.cookie ?? '';

    if (cookie.length > 4096) {
      throw new HttpFailure(400, 'Cookie header exceeds its limit');
    }

    const values = cookie.split(';').map((part) => part.trim())
      .filter((part) => part.startsWith(name + '='));

    if (values.length > 1) {
      throw new HttpFailure(400, 'Duplicate session cookie');
    }

    const token = values[0]?.slice(name.length + 1) ?? null;
    const version = this.settings.cookieVersion?.();

    return version ? token?.startsWith(version + '.') ? token.slice(version.length + 1) : null : token;
  }

  cookie(response: ServerResponse, token: string, expiresAt: Date): void {
    response.setHeader('Set-Cookie', [
      this.sessionCookie(ADMIN_AUTH_COOKIE, '/api/admin', token, expiresAt),
      this.sessionCookie(ADMIN_UI_AUTH_COOKIE, '/admin', token, expiresAt),
    ]);
  }

  uiCookie(response: ServerResponse, token: string, expiresAt: Date): void {
    response.setHeader('Set-Cookie', this.sessionCookie(ADMIN_UI_AUTH_COOKIE, '/admin', token, expiresAt));
  }

  private sessionCookie(name: string, path: string, token: string, expiresAt: Date): string {
    const version = this.settings.cookieVersion?.();
    const value = token && version ? version + '.' + token : token;

    return name + '=' + value + '; Path=' + path + '; HttpOnly; SameSite=Strict'
      + (this.origin.protocol === 'https:' ? '; Secure' : '') + '; Expires=' + expiresAt.toUTCString()
      + '; Max-Age=' + Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  }

  failure(response: ServerResponse, error: unknown): void {
    if (error instanceof TemplateValidationError) {
      const diagnostic = error.diagnostic;

      sendJson(response, 400, {
        error: BusinessErrorCode.Validation,
        diagnostic: {
          issue: diagnostic.issue,
          ...(diagnostic.source ? { source: { kind: diagnostic.source.kind, key: diagnostic.source.key } } : {}),
          ...(diagnostic.parameter === undefined ? {} : { parameter: diagnostic.parameter }),
        },
      });

      return;
    }
    if (error instanceof HttpFailure) {
      sendJson(response, error.status, { error: error.message });

      return;
    }
    if (error instanceof BusinessError) {
      const status = error.code === BusinessErrorCode.AddonUnavailable || error.code
        === BusinessErrorCode.HookUnavailable ? 503
        : error.code === BusinessErrorCode.InvalidCredentials
        || error.code === BusinessErrorCode.AuthenticationRequired
          ? 401 : error.code === BusinessErrorCode.TooManyAttempts ? 429
            : error.code === BusinessErrorCode.NotFound ? 404 : error.code === BusinessErrorCode.Forbidden ? 403
              : error.code === BusinessErrorCode.Validation ? 400 : 409;

      if (error instanceof AdminLoginThrottledError) {
        response.setHeader('Retry-After', Math.max(1, error.retryAfterSeconds));
      }
      if (error.code === BusinessErrorCode.AuthenticationRequired) {
        this.cookie(response, '', new Date(0));
      }
      sendJson(response, status, {
        error: error.code,
        ...(error instanceof JsonLdValidationError ? { jsonLdIssue: error.message } : {}),
        ...(error instanceof SiteLocalAddressInUseError ? { field: 'onboarding.localAddress' } : {}),
        ...(error.code === BusinessErrorCode.HookDenied ? { reason: error.message } : {}),
      });

      return;
    }
    sendJson(response, 500, { error: 'InternalError' });
  }
}
