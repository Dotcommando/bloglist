import { BusinessError, BusinessErrorCode } from '../shared/business-error.js';
import { hasAdministratorGrant, type IAdminAuthorization } from './admin-authorization.js';

export type ObjectScope = 'all' | 'own' | 'groups';

export type ObjectGrants = Readonly<Record<string, readonly ObjectScope[]>>;

const contentActions = new Set([
  'cms.pages.create', 'cms.pages.list', 'cms.pages.read', 'cms.pages.update',
  'cms.chunks.create', 'cms.chunks.list', 'cms.chunks.read', 'cms.chunks.update',
  'cms.snippets.create', 'cms.snippets.list', 'cms.snippets.read',
]);

export function isObjectScope(input: unknown): input is ObjectScope {
  return input === 'all' || input === 'own' || input === 'groups';
}

export function supportsContentScope(actionId: string): boolean {
  return contentActions.has(actionId);
}

export interface IContentAccess {
  readonly actorId: string;
  readonly siteId: string;
  readonly actionId: string;
  readonly scopes: readonly ObjectScope[];
  readonly groupIds: readonly string[];
  readonly administrator: boolean;
  readonly automaticPageUrl?: true;
}

export function resolveContentAccess(authority: IAdminAuthorization | undefined, actorId: string,
  siteId: string, actionId: string): IContentAccess | undefined {
  return supportsContentScope(actionId) ? resolveSiteActionAccess(authority, actorId, siteId, actionId,
    ['all', 'own', 'groups']) : undefined;
}

export function resolveSiteActionAccess(authority: IAdminAuthorization | undefined, actorId: string,
  siteId: string, actionId: string, allowedScopes: readonly ObjectScope[]): IContentAccess | undefined {
  if (!authority) {
    return undefined;
  }

  const administrator = hasAdministratorGrant(authority, actionId, siteId);

  if (administrator) {
    return { actorId, siteId, actionId, scopes: ['all'], groupIds: [], administrator };
  }

  const grant = authority.siteGrants?.find((item) => item.siteId === siteId && item.actionIds.includes(actionId));
  const scopes = grant?.objectScopes[actionId]?.filter((scope) => allowedScopes.includes(scope));

  return grant && scopes?.length
    ? { actorId, siteId, actionId, scopes, groupIds: grant.groupIds, administrator }
    : undefined;
}

export type ContentDomain = 'pages' | 'chunks' | 'snippets';

export interface IContentGroupAssignment {
  readonly domain: ContentDomain;
  readonly objectId: string;
  readonly accessGroupId: string | null;
}

export interface IContentCreationAccess {
  readonly authority?: IContentAccess;
  readonly accessGroupId?: string | null;
}

export function authorizeContentCreation(siteId: string, input: IContentCreationAccess): void {
  const { authority, accessGroupId } = input;
  const groupMember = accessGroupId && authority?.groupIds.includes(accessGroupId);
  const allowsCreation = authority?.scopes.includes('all') || authority?.scopes.includes('own')
    || authority?.scopes.includes('groups') && groupMember;

  if (
    authority
    && (authority.siteId !== siteId
    || !allowsCreation)
    || accessGroupId
    && !authority?.administrator
    && !groupMember
  ) {
    throw new BusinessError(BusinessErrorCode.Forbidden, 'Content creation is outside the assigned scope');
  }
}
