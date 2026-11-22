export interface IAdminUser {
  readonly adminUserId: string;
  readonly email: string;
  readonly blocked: boolean;
  readonly version: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface IAdminUserList {
  readonly items: readonly IAdminUser[];
  readonly nextCursor: string | null;
  readonly currentAdminUserId: string;
}

export enum AdminUserAction {
  Create = 'Create',
  Password = 'Password',
  Block = 'Block',
  Unblock = 'Unblock',
  Delete = 'Delete',
}
