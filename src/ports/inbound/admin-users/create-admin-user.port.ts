import type { IAdminUserProfile } from '../../../domain/admin-users/admin-user-profile.js';

export interface ICreateAdminUserInput {
  readonly actorId: string;
  readonly email: string;
  readonly password: string;
  readonly assignment?: { readonly roleId: string; readonly siteId: string | null };
}

export interface ICreateAdminUser {
  execute(input: ICreateAdminUserInput): Promise<IAdminUserProfile>;
}
