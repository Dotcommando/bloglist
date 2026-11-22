import type { IAdminUserProfile } from '../admin-users/admin-user-profile.js';
import { SnapshotEntity } from '../shared/snapshot-entity.js';
import { requireCondition, requireInstant, requireText } from '../shared/validation.js';

export interface IAdminAuthSessionState {
  readonly sessionId: string;
  readonly adminUserId: string;
  readonly accountVersion: string;
  readonly tokenDigest: string;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly clientAddress: string | null;
  readonly userAgent: string | null;
}

export interface IAdminAuthSessionProfile {
  readonly sessionId: string;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  readonly expiresAt: Date;
  readonly clientAddress: string | null;
  readonly userAgent: string | null;
  readonly current: boolean;
}

export interface ICurrentAdminUser {
  readonly user: IAdminUserProfile;
  readonly session: IAdminAuthSessionProfile;
}

export interface IAdminLoginResult extends ICurrentAdminUser {
  /** Private delivery value for the HTTP cookie; never serialize it in JSON. */
  readonly token: string;
}

export class AdminAuthSession extends SnapshotEntity<IAdminAuthSessionState> {
  constructor(state: IAdminAuthSessionState) {
    for (const value of [state.sessionId, state.adminUserId, state.accountVersion, state.tokenDigest]) {
      requireText(value, 'Session identity');
    }

    for (const value of [state.createdAt, state.lastSeenAt, state.expiresAt]) {
      requireInstant(value, 'Session instant');
    }
    requireCondition(state.lastSeenAt >= state.createdAt && state.expiresAt > state.createdAt,
      'Invalid session interval');

    if (state.revokedAt !== null) {
      requireInstant(state.revokedAt, 'revokedAt');
    }
    requireCondition(state.clientAddress === null || state.clientAddress.length <= 128, 'Invalid client address');
    requireCondition(state.userAgent === null || state.userAgent.length <= 1024, 'User agent exceeds its limit');
    super(state);
  }

  active(at: Date, accountVersion: string): boolean {
    const state = this.toState();

    return state.revokedAt === null && state.expiresAt > at && state.accountVersion === accountVersion;
  }

  touch(at: Date): void {
    const state = this.toState();

    this.replaceState(new AdminAuthSession({ ...state, lastSeenAt: at }).toState());
  }

  revoke(at: Date): void {
    const state = this.toState();

    if (state.revokedAt === null) {
      this.replaceState({ ...state, revokedAt: at });
    }
  }

  profile(currentSessionId: string): IAdminAuthSessionProfile {
    const state = this.toState();

    return structuredClone({
      sessionId: state.sessionId,
      createdAt: state.createdAt,
      lastSeenAt: state.lastSeenAt,
      expiresAt: state.expiresAt,
      clientAddress: state.clientAddress,
      userAgent: state.userAgent,
      current: state.sessionId === currentSessionId,
    });
  }
}
