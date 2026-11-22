import type { ISiteAuthorizationView } from '../../../domain/authorization/action-catalog.js';
import type { IContentGroupAssignment, ObjectGrants } from '../../../domain/authorization/content-access.js';
import type { SiteGroupChange, SiteRoleChange } from '../../../domain/authorization/site-role.js';

export interface ISiteAuthorizationStore {
  read(siteId: string, installation: boolean): Promise<ISiteAuthorizationView>;
  setContentGroup(siteId: string, actorId: string, assignment: IContentGroupAssignment): Promise<void>;
  save(siteId: string, actorId: string, revision: string | null,
    actionIds: readonly string[], scopes: ObjectGrants,
    role?: SiteRoleChange, group?: SiteGroupChange): Promise<ISiteAuthorizationView>;
}
