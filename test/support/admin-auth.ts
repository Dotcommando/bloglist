import type { IAdminLoginAttempt } from '../../src/domain/admin-auth/admin-auth.policy.js';
import { AdminAuthSession } from '../../src/domain/admin-auth/admin-auth-session.js';
import { AdminUser } from '../../src/domain/admin-users/admin-user.js';
import type {
  IAdminAuthTransaction, IAdminAuthUnitOfWorkPort,
} from '../../src/ports/outbound/admin-auth/admin-auth-store.port.js';
import type {
  IAdminAuthSecretsPort, IAdminAuthValuesPort,
} from '../../src/ports/outbound/admin-auth/admin-auth-values.port.js';
import type { IAdminPasswordPort } from '../../src/ports/outbound/admin-users/admin-user-capabilities.port.js';
import { account } from './admin-users.js';

interface IAuthFixture {
  readonly accounts: Map<string, AdminUser>;
  readonly sessions: Map<string, AdminAuthSession>;
  readonly attempts: Map<string, IAdminLoginAttempt>;
  readonly secrets: IAdminAuthSecretsPort;
  readonly values: IAdminAuthValuesPort;
  readonly passwords: IAdminPasswordPort;
  readonly work: IAdminAuthUnitOfWorkPort;
  setTime(at: Date): void;
}

export function authFixture(): IAuthFixture {
  const accounts = new Map([['user-1', account()], ['user-2', account('user-2')]]);
  const sessions = new Map<string, AdminAuthSession>();
  const attempts = new Map<string, IAdminLoginAttempt>();
  let sequence = 0;
  let clock = new Date('2026-10-25T11:00:00Z');
  const secrets: IAdminAuthSecretsPort = {
    issue: () => {
      const token = 'token-' + ++sequence;

      return { token, tokenDigest: 'digest-' + token };
    },
    digest: (token) => token.startsWith('token-') ? 'digest-' + token : null,
    loginKey: (email) => 'key-' + email,
    sourceKey: (address) => 'source-' + (address ?? 'unknown'),
  };
  const values: IAdminAuthValuesPort = {
    now: () => new Date(clock),
    nextSessionId: () => 'session-' + ++sequence,
    sessionExpiresAt: (at) => new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 2, at.getUTCDate(),
      at.getUTCHours(), at.getUTCMinutes(), at.getUTCSeconds())),
  };
  const passwords: IAdminPasswordPort = {
    hash: async () => 'synthetic-opaque-digest',
    verify: async (password, digest) => password === 'correct password' && digest === 'synthetic-opaque-digest',
  };
  const work: IAdminAuthUnitOfWorkPort = {
    run: async (callback) => {
      const users = new Map([...accounts].map(([id, user]) => [id, new AdminUser(user.toState())]));
      const staged = new Map([...sessions].map(([id, session]) => [id, new AdminAuthSession(session.toState())]));
      const counters = structuredClone(attempts);
      const tx: IAdminAuthTransaction = {
        readAuthority: async () => ({ systemAdmin: true, siteIds: [], siteAdminSiteIds: [] }),
        findById: async (id) => {
          const user = users.get(id);

          return user?.toState().deletedAt === null ? user : null;
        },
        findByEmail: async (email) => [...users.values()].find((u) => u.toState().email === email
          && u.toState().deletedAt === null) ?? null,
        countActive: async () => [...users.values()].filter((u) => u.active).length,
        save: async (user) => {
          users.set(user.toState().adminUserId, new AdminUser(user.toState()));
        },
        findSessionByDigest: async (digest) =>
          [...staged.values()].find((s) => s.toState().tokenDigest === digest) ?? null,
        findSessionById: async (id) => staged.get(id) ?? null,
        createSession: async (session) => {
          staged.set(session.toState().sessionId, session);
        },
        saveSession: async (session) => {
          staged.set(session.toState().sessionId, session);
        },
        listActiveSessions: async (id, version, at, limit, cursor) => {
          const rows = [...staged.values()].filter((s) => s.toState().adminUserId === id && s.active(at, version))
            .sort((a, b) => a.toState().sessionId.localeCompare(b.toState().sessionId))
            .filter((s) => cursor === null || s.toState().sessionId > cursor);
          const items = rows.slice(0, limit);

          return { items, nextCursor: rows.length > limit ? items.at(-1)?.toState().sessionId ?? null : null };
        },
        findLoginAttempt: async (key) => counters.get(key) ?? null,
        saveLoginAttempt: async (attempt) => {
          counters.set(attempt.loginKey, structuredClone(attempt));
        },
        clearLoginAttempt: async (key) => {
          counters.delete(key);
        },
      };
      const result = await callback(tx);

      accounts.clear();
      sessions.clear();
      attempts.clear();

      for (const [id, user] of users) {
        accounts.set(id, user);
      }

      for (const [id, session] of staged) {
        sessions.set(id, session);
      }

      for (const [key, counter] of counters) {
        attempts.set(key, counter);
      }

      return result;
    },
  };

  return {
    accounts,
    sessions,
    attempts,
    secrets,
    values,
    passwords,
    work,
    setTime: (at: Date) => {
      clock = at;
    },
  };
}

export const loginInput = {
  email: 'user-1@example.test',
  password: 'correct password',
  clientAddress: '127.0.0.1',
  userAgent: 'Synthetic browser',
};
