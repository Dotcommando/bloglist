import type { IAdminAuthorization } from '../authorization/admin-authorization.js';
import type { ICursorInput } from '../shared/cursor-page.js';

export enum AdminUserListStatus {
  All = 'All',
  Active = 'Active',
  Blocked = 'Blocked',
}

export interface IAdminUserProfile {
  readonly adminUserId: string;
  readonly email: string;
  readonly allowedSiteIds: readonly string[];
  readonly authorization?: IAdminAuthorization;
  readonly blocked: boolean;
  readonly version: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface IAdminUserListQuery extends ICursorInput {
  readonly status: AdminUserListStatus;
}

export interface IAdminUserDeletion {
  readonly adminUserId: string;
  readonly deletedAt: Date;
  readonly version: string;
}
