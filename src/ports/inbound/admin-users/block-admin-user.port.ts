import type { IAdminUserProfile } from '../../../domain/admin-users/admin-user-profile.js';

export interface IBlockAdminUserInput {
  readonly actorId: string;
  readonly adminUserId: string;
  readonly expectedVersion: string;
  readonly blocked: boolean;
}

export interface IBlockAdminUser {
  execute(input: IBlockAdminUserInput): Promise<IAdminUserProfile>;
}
