import type { ObjectGrants, ObjectScope } from './content-access.js';
import type { ISiteGroup, ISiteRole, ISiteRoleActor } from './site-role.js';

const methods = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const;

export interface ICatalogAction {
  readonly actionId: string;
  readonly method: (typeof methods)[number];
  readonly route: string;
  readonly scope: 'site' | 'installation';
  readonly admission: 'admin' | 'installationAdmin' | 'selfService' | 'public' | 'infrastructure' | 'internal';
  readonly shortDescription: string;
  readonly description: string;
  readonly domains: readonly string[];
  readonly create: boolean;
  readonly read: boolean;
  readonly update: boolean;
  readonly delete: boolean;
  readonly execute: boolean;
}

export interface ISiteAuthorizationView {
  readonly revision: string | null;
  readonly actions: readonly (ICatalogAction & { readonly allowedObjectScopes: readonly ObjectScope[] })[];
  readonly delegableActionIds: readonly string[];
  readonly administratorActionIds: Readonly<Record<string, readonly string[]>>;
  readonly managerActionIds: readonly string[];
  readonly managerObjectScopes: ObjectGrants;
  readonly customRoles: readonly ISiteRole[];
  readonly groups: readonly ISiteGroup[];
  readonly siteActors: readonly ISiteRoleActor[];
}

const admissions = ['admin', 'installationAdmin', 'selfService', 'public', 'infrastructure', 'internal'] as const;

export function readCatalogActions(value: unknown): readonly ICatalogAction[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid action catalog');
  }

  return value.map((item: unknown) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new Error('Invalid action declaration');
    }

    const { actionId, method, route, scope, admission, shortDescription, description, domains,
      create, read, update, delete: remove, execute } = Object.fromEntries(Object.entries(item));
    const admissionType = admissions.find((candidate) => candidate === admission);
    const httpMethod = methods.find((candidate) => candidate === method);

    if (
      typeof actionId !== 'string'
      || !/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/.test(actionId)
      || !httpMethod
      || typeof route !== 'string'
      || !route.startsWith('/')
      || /[?#\\]/.test(route)
      || scope !== 'site'
      && scope !== 'installation'
      || !admissionType
      || typeof shortDescription !== 'string'
      || !shortDescription.trim()
      || typeof description !== 'string'
      || !description.trim()
      || !Array.isArray(domains)
      || !domains.length
      || !domains.every((domain) => typeof domain === 'string')
      || typeof create !== 'boolean'
      || typeof read !== 'boolean'
      || typeof update !== 'boolean'
      || typeof remove !== 'boolean'
      || typeof execute !== 'boolean'
    ) {
      throw new Error('Invalid action declaration');
    }

    return {
      actionId,
      method: httpMethod,
      route,
      scope,
      admission: admissionType,
      shortDescription,
      description,
      domains,
      create,
      read,
      update,
      delete: remove,
      execute,
    };
  });
}

export function isDelegableSiteAction(action: ICatalogAction): boolean {
  return action.scope === 'site' && action.admission === 'admin'
    && (action.route.includes('/:siteId') || action.actionId === 'cms.rendering-previews.read')
    && !action.actionId.startsWith('cms.authorization.')
    && !action.actionId.startsWith('cms.dumps.');
}

export function actionRouteKey(route: string): string {
  return route.replace(/:[A-Za-z][A-Za-z0-9]*/g, ':');
}
