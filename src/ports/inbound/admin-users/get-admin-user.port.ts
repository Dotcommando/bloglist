import type { IAdminUserProfile } from '../../../domain/admin-users/admin-user-profile.js';

export interface IGetAdminUserInput {
  readonly actorId: string;
  readonly adminUserId: string;
}

export interface IGetAdminUser {
  execute(input: IGetAdminUserInput): Promise<IAdminUserProfile | null>;
}
