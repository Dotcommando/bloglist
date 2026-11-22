import type { IBlockAdminUser } from '../../../../ports/inbound/admin-users/block-admin-user.port.js';
import type { ICreateAdminUser } from '../../../../ports/inbound/admin-users/create-admin-user.port.js';
import type { IDeleteAdminUser } from '../../../../ports/inbound/admin-users/delete-admin-user.port.js';
import type { IListAdminUsers } from '../../../../ports/inbound/admin-users/list-admin-users.port.js';
import type { IUpdateAdminUser } from '../../../../ports/inbound/admin-users/update-admin-user.port.js';

export interface IAdminUserOperations {
  readonly actorId: string;
  readonly create: ICreateAdminUser;
  readonly list: IListAdminUsers;
  readonly update: IUpdateAdminUser;
  readonly block: IBlockAdminUser;
  readonly remove: IDeleteAdminUser;
}

export interface IAdminUserOperationFactory {
  forSession(token: string | null): Promise<IAdminUserOperations>;
}
