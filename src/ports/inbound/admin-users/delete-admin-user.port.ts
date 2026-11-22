import type { IAdminUserDeletion } from '../../../domain/admin-users/admin-user-profile.js';

export interface IDeleteAdminUserInput {
  readonly actorId: string;
  readonly adminUserId: string;
  readonly expectedVersion: string;
}

export interface IDeleteAdminUser {
  execute(input: IDeleteAdminUserInput): Promise<IAdminUserDeletion>;
}
