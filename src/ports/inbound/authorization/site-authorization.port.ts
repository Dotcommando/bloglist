import type { ISiteAuthorizationView } from '../../../domain/authorization/action-catalog.js';
import type { IAdminAuthorization } from '../../../domain/authorization/admin-authorization.js';
import type { IContentGroupAssignment, ObjectGrants } from '../../../domain/authorization/content-access.js';
import type { SiteGroupChange, SiteRoleChange } from '../../../domain/authorization/site-role.js';

export interface ISiteAuthorizationInput {
  readonly actorId: string;
  readonly authority: IAdminAuthorization | undefined;
  readonly siteId: string;
}

export interface ISiteAuthorization {
  read(input: ISiteAuthorizationInput): Promise<ISiteAuthorizationView>;
  setContentGroup(input: ISiteAuthorizationInput & IContentGroupAssignment): Promise<void>;
  save(input: ISiteAuthorizationInput & {
    readonly revision: string | null;
    readonly actionIds: readonly string[];
    readonly objectScopes?: ObjectGrants;
    readonly role?: SiteRoleChange;
    readonly group?: SiteGroupChange;
  }): Promise<ISiteAuthorizationView>;
}

export const SITE_AUTHORIZATION = Symbol('SITE_AUTHORIZATION');
