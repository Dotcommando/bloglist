import { type ICatalogAction, isDelegableSiteAction } from '../../../../domain/authorization/action-catalog.js';
import {
  canReadRenderingPreview, hasAdministratorGrant, type IAdminAuthorization,
} from '../../../../domain/authorization/admin-authorization.js';
import { type IContentAccess, resolveContentAccess, supportsContentScope } from
  '../../../../domain/authorization/content-access.js';
import { coreActions } from '../../../../domain/authorization/core-actions.js';

const adminActions = coreActions.filter((action) => action.admission === 'admin'
  || action.admission === 'installationAdmin' || action.admission === 'selfService')
  .map((action) => ({
    action,
    match: new RegExp('^' + action.route.split('/').map((segment) => {
      if (segment === ':siteId') {
        return '(?<siteId>[A-Za-z0-9_-]{1,128})';
      }
      if (segment === ':previewId') {
        return '[a-f0-9]{48}';
      }
      if (segment.startsWith(':')) {
        return segment.endsWith('*') ? '.+' : '[A-Za-z0-9_.-]{1,256}';
      }

      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('/') + '$'),
  }));

function matchedAction(method: string, pathname: string): { action: ICatalogAction; siteId?: string } | undefined {
  for (const entry of adminActions) {
    const match = entry.action.method === method ? entry.match.exec(pathname) : null;

    if (match) {
      const siteId = match.groups?.siteId;

      return { action: entry.action, ...(siteId === undefined ? {} : { siteId }) };
    }
  }

  return undefined;
}

export function isRegisteredAdminEndpoint(method: string, pathname: string): boolean {
  return matchedAction(method, pathname) !== undefined;
}

export function contentAccessForEndpoint(method: string, pathname: string, actorId: string,
  authority?: IAdminAuthorization): IContentAccess | undefined {
  const route = matchedAction(method, pathname);

  return route?.siteId && route.action.scope === 'site'
    ? resolveContentAccess(authority, actorId, route.siteId, route.action.actionId)
    : undefined;
}

export function allowsAdminEndpoint(method: string, pathname: string, authority?: IAdminAuthorization): boolean {
  const route = matchedAction(method, pathname);

  if (!route) {
    return false;
  }

  const { action, siteId } = route;

  if (action.admission === 'selfService') {
    return true;
  }
  if (action.actionId === 'cms.sites.list' && !authority?.systemAdmin) {
    return !authority?.siteAdminSiteIds.length || authority.siteAdminActionIds?.includes(action.actionId) === true;
  }
  if (!authority) {
    return false;
  }
  if (hasAdministratorGrant(authority, action.actionId, action.scope === 'site' ? siteId : undefined)) {
    return true;
  }
  if (action.actionId === 'cms.rendering-previews.read') {
    // The owner resolves the preview's site and checks the actor's authority on it.
    return canReadRenderingPreview(authority);
  }
  if (!siteId || !isDelegableSiteAction(action)) {
    return false;
  }

  const grant = authority.siteGrants?.find((item) => item.siteId === siteId
    && item.actionIds.includes(action.actionId));
  const scopes = grant?.objectScopes[action.actionId] ?? [];

  return scopes.includes('all') || scopes.length > 0 && supportsContentScope(action.actionId);
}
