import type { ObjectGrants } from './content-access.js';

export interface ISiteRole {
  readonly roleId: string;
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly actionIds: readonly string[];
  readonly objectScopes: ObjectGrants;
  readonly actorIds: readonly string[];
}

export type SiteRoleChange = (Omit<ISiteRole, 'roleId' | 'actionIds' | 'objectScopes'>
  & { readonly roleId: string | null })
  | { readonly roleId: string; readonly remove: true };

export interface ISiteGroup extends Omit<ISiteRole, 'roleId' | 'actionIds' | 'objectScopes'> {
  readonly groupId: string;
  readonly builtIn?: 'installation' | 'site';
  readonly members?: readonly ISiteRoleActor[];
}

export type SiteGroupChange = (Omit<ISiteGroup, 'groupId' | 'builtIn' | 'members'>
  & { readonly groupId: string | null })
  | { readonly groupId: string; readonly remove: true };

export interface ISiteRoleActor {
  readonly adminUserId: string;
  readonly email: string;
}
