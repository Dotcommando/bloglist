import type { IncomingMessage, ServerResponse } from 'node:http';

import type { IAddonActionDeclaration } from '@zarya/addon-contracts/addons';

import { hasAdministratorGrant } from '../../../../domain/authorization/admin-authorization.js';
import { legacyAddonAdminActionId } from '../../../../domain/authorization/built-in-roles.js';
import { type IContentAccess, resolveSiteActionAccess } from '../../../../domain/authorization/content-access.js';
import { BusinessError, BusinessErrorCode } from '../../../../domain/shared/business-error.js';
import type { IGetCurrentAdminUser } from '../../../../ports/inbound/admin-auth/get-current-admin-user.port.js';
/** Authenticate protected HTTP requests before any controller consumes their body. */
import {
  allowsAdminEndpoint, contentAccessForEndpoint, isRegisteredAdminEndpoint,
} from './admin-endpoint-authorization.js';
import { ADMIN_UI_AUTH_COOKIE, AdminHttpBoundary, type IAdminHttpSettings } from './admin-http.boundary.js';

const contentAccess = new WeakMap<IncomingMessage, IContentAccess>();

const automaticPageUrls = new WeakSet<IncomingMessage>();

const snippetRepublication = new WeakSet<IncomingMessage>();

const legacyAddonRequests = new WeakSet<IncomingMessage>();

export function requestUsesLegacyAddonGrant(request: IncomingMessage): boolean {
  return legacyAddonRequests.has(request);
}

export function requestContentAccess(request: IncomingMessage): IContentAccess | undefined {
  return contentAccess.get(request);
}

const pageUpdateReadAccess = new WeakMap<IncomingMessage, IContentAccess>();

export function requestPageUpdateReadAccess(request: IncomingMessage): IContentAccess | undefined {
  return pageUpdateReadAccess.get(request);
}

export function requestAllowsSnippetRepublication(request: IncomingMessage): boolean {
  return snippetRepublication.has(request);
}

export function requestUsesAutomaticPageUrl(request: IncomingMessage): boolean {
  return automaticPageUrls.has(request);
}

export class AdminRequestGate {
  private readonly boundary: AdminHttpBoundary;

  constructor(settings: IAdminHttpSettings, private readonly current: IGetCurrentAdminUser) {
    this.boundary = new AdminHttpBoundary(settings);
  }

  async allowDocumentAsset(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    try {
      this.boundary.check(request, response);
      await this.current.execute({ token: this.boundary.token(request, ADMIN_UI_AUTH_COOKIE) });

      return true;
    } catch (error) {
      this.boundary.failure(response, error);

      return false;
    }
  }

  async allowAddon(request: IncomingMessage, response: ServerResponse, siteId: string,
    action: IAddonActionDeclaration): Promise<IContentAccess | undefined> {
    try {
      this.boundary.check(request, response);
      const { user } = await this.current.execute({ token: this.boundary.token(request) });
      const access = resolveSiteActionAccess(user.authorization, user.adminUserId, siteId, action.actionId,
        action.allowedObjectScopes);

      if (!access) {
        throw new BusinessError(BusinessErrorCode.Forbidden, 'Action is outside the assigned authority');
      }

      return access;
    } catch (error) {
      response.shouldKeepAlive = false;
      response.setHeader('Connection', 'close');
      this.boundary.failure(response, error);

      return undefined;
    }
  }

  async allow(request: IncomingMessage, response: ServerResponse, hasLegacyHandler?: (path: string) => boolean):
  Promise<boolean> {
    const pathname = request.url?.split('?')[0] ?? '';

    if (
      !/^\/api\/admin(?:\/|$)/.test(pathname)
      || pathname === '/api/admin/auth/login'
      || pathname === '/api/admin/auth/logout'
    ) {
      return true;
    }

    try {
      this.boundary.check(request, response);
      const { user } = await this.current.execute({ token: this.boundary.token(request) });
      const method = request.method ?? '';

      if (!allowsAdminEndpoint(method, pathname, user.authorization)) {
        if (
          isRegisteredAdminEndpoint(method, pathname)
          || !user.authorization
          || !hasAdministratorGrant(user.authorization, legacyAddonAdminActionId)
          || !hasLegacyHandler?.(pathname)
        ) {
          throw new BusinessError(BusinessErrorCode.Forbidden, 'Action is outside the assigned authority');
        }
        legacyAddonRequests.add(request);

        return true;
      }

      const access = contentAccessForEndpoint(method, pathname, user.adminUserId, user.authorization);

      if (access?.actionId === 'cms.pages.update') {
        const read = contentAccessForEndpoint('GET', pathname, user.adminUserId, user.authorization);

        if (read) {
          pageUpdateReadAccess.set(request, read);
        }
      }

      const snippetUpdate = method === 'POST' ? /^\/api\/admin\/sites\/([^/]+)\/snippets\/[^/]+$/.exec(pathname) : null;

      if (
        snippetUpdate
        && allowsAdminEndpoint('POST',
          '/api/admin/sites/' + snippetUpdate[1] + '/publish', user.authorization)
      ) {
        snippetRepublication.add(request);
      }

      const pageWrite = method === 'POST'
        ? /^\/api\/admin\/sites\/([^/]+)\/pages(?:\/[^/]+\/publication)?$/.exec(pathname) : null;
      const automatic = pageWrite && !allowsAdminEndpoint('POST',
        '/api/admin/sites/' + pageWrite[1] + '/urls/virtual', user.authorization);

      if (automatic) {
        automaticPageUrls.add(request);
      }
      if (access) {
        contentAccess.set(request, automatic ? { ...access, automaticPageUrl: true } : access);
      }

      return true;
    } catch (error) {
      response.shouldKeepAlive = false;
      response.setHeader('Connection', 'close');
      this.boundary.failure(response, error);

      return false;
    }
  }
}
