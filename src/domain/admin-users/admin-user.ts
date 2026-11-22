import { SnapshotEntity } from '../shared/snapshot-entity.js';
import { requireCondition, requireInstant, requireNewVersion, requireText } from '../shared/validation.js';
import { normalizeAdminEmail, requireEmptySiteAssignments } from './admin-user.policy.js';
import type { IAdminUserProfile } from './admin-user-profile.js';

export interface IAdminUserState extends IAdminUserProfile {
  readonly passwordDigest: string;
  readonly deletedAt: Date | null;
}

export interface IAdminUserChanges {
  readonly email?: string;
  readonly passwordDigest?: string;
  readonly allowedSiteIds?: readonly string[];
}

export function adminUserProfile(state: IAdminUserProfile): IAdminUserProfile {
  requireText(state.adminUserId, 'adminUserId');
  requireText(state.version, 'version');
  requireCondition(state.email === normalizeAdminEmail(state.email), 'Email is not normalized');
  requireEmptySiteAssignments(state.allowedSiteIds);
  requireCondition(typeof state.blocked === 'boolean', 'Invalid blocked state');
  requireInstant(state.createdAt, 'createdAt');
  requireInstant(state.updatedAt, 'updatedAt');
  requireCondition(state.updatedAt >= state.createdAt, 'Account update predates creation');

  return structuredClone({
    adminUserId: state.adminUserId,
    email: state.email,
    allowedSiteIds: [...state.allowedSiteIds],
    blocked: state.blocked,
    version: state.version,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  });
}

export class AdminUser extends SnapshotEntity<IAdminUserState> {
  constructor(state: IAdminUserState) {
    adminUserProfile(state);
    requireText(state.passwordDigest, 'passwordDigest');

    if (state.deletedAt !== null) {
      requireInstant(state.deletedAt, 'deletedAt');
      requireCondition(state.deletedAt >= state.createdAt && state.deletedAt <= state.updatedAt,
        'Invalid deletion time');
    }
    super(state);
  }

  get active(): boolean {
    const state = this.toState();

    return !state.blocked && state.deletedAt === null;
  }

  profile(): IAdminUserProfile {
    return adminUserProfile(this.toState());
  }

  update(changes: IAdminUserChanges, at: Date, version: string): void {
    const state = this.requireMutable(version);

    requireCondition(Object.keys(changes).length > 0, 'No account changes supplied');
    const next = new AdminUser({
      ...state,
      email: changes.email === undefined ? state.email : normalizeAdminEmail(changes.email),
      passwordDigest: changes.passwordDigest ?? state.passwordDigest,
      allowedSiteIds: changes.allowedSiteIds ?? state.allowedSiteIds,
      updatedAt: at,
      version,
    });

    this.replaceState(next.toState());
  }

  setBlocked(blocked: boolean, at: Date, version: string): void {
    const state = this.requireMutable(version);

    this.replaceState(new AdminUser({ ...state, blocked, updatedAt: at, version }).toState());
  }

  delete(at: Date, version: string): void {
    const state = this.requireMutable(version);

    this.replaceState(new AdminUser({ ...state, deletedAt: at, updatedAt: at, version }).toState());
  }

  private requireMutable(version: string): IAdminUserState {
    const state = this.toState();

    requireCondition(state.deletedAt === null, 'Account is deleted');
    requireNewVersion(state.version, version);

    return state;
  }
}
