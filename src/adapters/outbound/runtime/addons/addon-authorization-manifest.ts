import type { IAddonAuthorizationDeclaration } from '@zarya/addon-contracts/addons';

import { actionRouteKey, readCatalogActions } from '../../../../domain/authorization/action-catalog.js';
import { coreActions } from '../../../../domain/authorization/core-actions.js';

export const addonRouteInventoryFile = 'server/http-routes.json';

const coreDomains = new Set(coreActions.flatMap((action) => action.domains));

const coreRoutes = new Set(coreActions.map((action) => `${action.method} ${actionRouteKey(action.route)}`));

const siteRoute = /^\/api\/admin\/sites\/:siteId\/([a-z][a-z0-9-]*)(?:\/|$)/;

const coreSiteSections = new Set(coreActions.map((action) => siteRoute.exec(action.route)?.[1]));

const scopes = ['own', 'groups', 'all'] as const;

const routeTemplate = /^\/api(?:\/(?:[a-z][a-z0-9-]*|:[A-Za-z][A-Za-z0-9]*))+$/;

export function readAddonAuthorization(value: unknown, addonKey: string,
  prefixes: readonly string[]): IAddonAuthorizationDeclaration {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid add-on authorization catalog');
  }

  const { version, actions: rawActions, domains: rawDomains, adminUi } = Object.fromEntries(Object.entries(value));

  if (
    version !== 1
    || !Array.isArray(rawActions)
    || rawActions.length > 256
    || !Array.isArray(rawDomains)
    || rawDomains.length > 64
  ) {
    throw new Error('Unsupported add-on authorization catalog');
  }
  if (addonKey === 'cms') {
    throw new Error('Reserved authorization namespace');
  }

  const owned = new Set<string>();
  const domains = rawDomains.map((input: unknown) => {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      throw new Error('Invalid add-on action domain');
    }

    const { domainId, name, description } = Object.fromEntries(Object.entries(input));

    if (
      typeof domainId !== 'string'
      || domainId.length > 256
      || !domainId.startsWith(addonKey + '.')
      || !/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/.test(domainId)
      || owned.has(domainId)
      || typeof name !== 'string'
      || !name.trim()
      || name.length > 160
      || typeof description !== 'string'
      || !description.trim()
      || description.length > 8192
    ) {
      throw new Error('Invalid add-on action domain');
    }
    owned.add(domainId);

    return { domainId, name, description };
  });
  const seenIds = new Set<string>();
  const seenRoutes = new Set<string>();
  const normalizedPrefixes = prefixes.map(actionRouteKey);
  const actions = readCatalogActions(rawActions).map((action, index) => {
    const route = actionRouteKey(action.route);
    const endpoint = `${action.method} ${route}`;
    const siteSection = siteRoute.exec(action.route)?.[1];
    const declaredScopes: unknown = rawActions[index]?.allowedObjectScopes;

    if (
      !action.actionId.startsWith(addonKey + '.')
      || action.actionId.length > 256
      || seenIds.has(action.actionId)
      || !routeTemplate.test(action.route)
      || action.route.length > 512
      || seenRoutes.has(endpoint)
      || coreRoutes.has(endpoint)
      || !normalizedPrefixes.some((prefix) => route === prefix || route.startsWith(prefix + '/'))
      || action.scope !== 'site'
      || action.admission !== 'admin'
      && action.admission !== 'public'
      || action.admission === 'admin'
      && (!siteSection
      || coreSiteSections.has(siteSection))
      || action.admission === 'public'
      && action.route.startsWith('/api/admin/')
      || action.shortDescription.length > 240
      || action.description.length > 8192
      || action.domains.length > 32
      || new Set(action.domains).size !== action.domains.length
      || !action.domains.every((domain) => owned.has(domain) || coreDomains.has(domain))
      || !Array.isArray(declaredScopes)
      || new Set(declaredScopes).size !== declaredScopes.length
      || !declaredScopes.every((scope) => scopes.some((known) => known === scope))
      || action.admission === 'public'
      && declaredScopes.length > 0
    ) {
      throw new Error('Invalid add-on action declaration');
    }
    seenIds.add(action.actionId);
    seenRoutes.add(endpoint);

    return {
      ...action,
      scope: action.scope,
      admission: action.admission,
      allowedObjectScopes: scopes.filter((scope) => declaredScopes.includes(scope)),
    };
  });
  const views = adminUi === undefined ? undefined : readAdminViews(adminUi, actions);

  return { version: 1, domains, actions, ...(views ? { adminUi: { views } } : {}) };
}

function readAdminViews(value: unknown, actions: IAddonAuthorizationDeclaration['actions']):
NonNullable<IAddonAuthorizationDeclaration['adminUi']>['views'] {
  if (
    !value
    || typeof value !== 'object'
    || !('views' in value)
    || !Array.isArray(value.views)
    || !value.views.length
    || value.views.length > 64
  ) {
    throw new Error('Invalid add-on view bindings');
  }

  const delegable = new Set(actions.filter((action) =>
    action.admission === 'admin' && action.allowedObjectScopes.length > 0).map((action) => action.actionId));
  const ids = new Set<string>();

  return value.views.map((view: unknown) => {
    if (
      !view
      || typeof view !== 'object'
      || !('id' in view)
      || !('actionIds' in view)
      || typeof view.id !== 'string'
      || !/^[a-z][a-z0-9-]{0,63}$/.test(view.id)
      || ids.has(view.id)
      || !Array.isArray(view.actionIds)
      || !view.actionIds.length
      || view.actionIds.length > 32
      || new Set(view.actionIds).size !== view.actionIds.length
      || !view.actionIds.every((id: unknown): id is string => typeof id === 'string' && delegable.has(id))
    ) {
      throw new Error('Invalid add-on view binding');
    }
    ids.add(view.id);

    return { id: view.id, actionIds: view.actionIds };
  });
}

export function requireAddonRouteParity(declaration: IAddonAuthorizationDeclaration, routes: unknown): void {
  const expected = new Set(declaration.actions.map(({ method, route }) => method + ' ' + route));

  if (
    !Array.isArray(routes)
    || !routes.every((route: unknown) => {
      if (
        !route
      || typeof route !== 'object'
      || !('method' in route)
      || !('route' in route)
      || typeof route.method !== 'string'
      || typeof route.route !== 'string'
      ) {
        return false;
      }

      return expected.delete(route.method + ' ' + route.route);
    })
    || expected.size
  ) {
    throw new Error('Runtime HTTP routes do not match declared Actions');
  }
}
