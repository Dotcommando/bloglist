import type { ObjectGrants } from './content-access.js';

export interface IAdminAuthorization {
  readonly systemAdmin: boolean;
  readonly siteIds: readonly string[];
  readonly systemActionIds?: readonly string[];
  readonly siteAdminActionIds?: readonly string[];
  readonly siteAdminSiteIds: readonly string[];
  readonly siteGrants?: readonly {
    readonly siteId: string;
    readonly actionIds: readonly string[];
    readonly objectScopes: ObjectGrants;
    readonly groupIds: readonly string[];
  }[];
}

export function hasAdministratorGrant(authority: IAdminAuthorization, actionId: string, siteId?: string): boolean {
  return authority.systemAdmin && authority.systemActionIds?.includes(actionId) === true
    || siteId !== undefined && authority.siteAdminSiteIds.includes(siteId)
    && authority.siteAdminActionIds?.includes(actionId) === true;
}

export function hasWholeSiteActionGrant(authority: IAdminAuthorization | undefined,
  actionId: string, siteId: string): boolean {
  return !!authority && (hasAdministratorGrant(authority, actionId, siteId)
    || authority.siteGrants?.some((grant) => grant.siteId === siteId && grant.actionIds.includes(actionId)
      && grant.objectScopes[actionId]?.includes('all')) === true);
}

export function canReadRenderingPreview(authority: IAdminAuthorization | undefined, siteId?: string): boolean {
  const actionId = 'cms.rendering-previews.read';

  return siteId === undefined
    ? !!authority && (hasAdministratorGrant(authority, actionId)
      || authority.siteIds.some((id) => hasWholeSiteActionGrant(authority, actionId, id)))
    : hasWholeSiteActionGrant(authority, actionId, siteId);
}

export interface IInitialAdminRole {
  readonly roleId: string;
  readonly siteId: string | null;
  readonly grantedBy: string;
}
