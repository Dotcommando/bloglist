import type { IAdminUserProfile } from '../../../domain/admin-users/admin-user-profile.js';

export interface IUpdateAdminUserInput {
  readonly actorId: string;
  readonly adminUserId: string;
  readonly expectedVersion: string;
  readonly email?: string;
  readonly password?: string;
  readonly allowedSiteIds?: readonly string[];
}

export interface IUpdateAdminUser {
  execute(input: IUpdateAdminUserInput): Promise<IAdminUserProfile>;
}
