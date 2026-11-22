import { type ClientSession, type Connection, type Model, Schema } from 'mongoose';

import type { IAdminLoginAttempt } from '../../../../../domain/admin-auth/admin-auth.policy.js';
import { AdminAuthSession, type IAdminAuthSessionState } from '../../../../../domain/admin-auth/admin-auth-session.js';
import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import type { IAdminAuthTransaction } from '../../../../../ports/outbound/admin-auth/admin-auth-store.port.js';
import type { IAdminUserTransaction } from '../../../../../ports/outbound/admin-users/admin-user-store.port.js';

interface ISessionRecord extends Omit<IAdminAuthSessionState, 'sessionId'> { readonly _id: string; }

interface IAttemptRecord extends Omit<IAdminLoginAttempt, 'loginKey'> { readonly _id: string; }

interface ISessionCursor {
  readonly createdAt: Date;
  readonly sessionId: string;
}

export interface IAdminAuthModels {
  readonly sessions: Model<ISessionRecord>;
  readonly attempts: Model<IAttemptRecord>;
}

const sessionSchema = new Schema<ISessionRecord>({
  _id: { type: String, required: true },
  adminUserId: { type: String, required: true },
  accountVersion: { type: String, required: true },
  tokenDigest: { type: String, required: true },
  createdAt: { type: Date, required: true },
  lastSeenAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
  clientAddress: { type: String, default: null },
  userAgent: { type: String, default: null },
}, { collection: 'admin_auth_sessions', versionKey: false, autoCreate: false, autoIndex: false, strict: 'throw' });

const attemptSchema = new Schema<IAttemptRecord>({
  _id: { type: String, required: true },
  failures: { type: Number, required: true },
  windowStartedAt: { type: Date, required: true },
  blockedUntil: { type: Date, default: null },
  expiresAt: { type: Date, required: true },
}, { collection: 'admin_login_attempts', versionKey: false, autoCreate: false, autoIndex: false, strict: 'throw' });

export function createAdminAuthModels(connection: Connection): IAdminAuthModels {
  return {
    sessions: connection.model<ISessionRecord>('AdminAuthSession', sessionSchema),
    attempts: connection.model<IAttemptRecord>('AdminLoginAttempt', attemptSchema),
  };
}

function sessionRecord(session: AdminAuthSession): ISessionRecord {
  const { sessionId, ...fields } = session.toState();

  return { _id: sessionId, ...fields };
}

function fromRecord(row: ISessionRecord): AdminAuthSession {
  const { _id, ...fields } = row;

  return new AdminAuthSession({ ...fields, sessionId: _id });
}

function decodeCursor(cursor: string, adminUserId: string, accountVersion: string): ISessionCursor {
  try {
    if (cursor.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(cursor)) {
      throw new Error();
    }

    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));

    if (
      value === null
      || typeof value !== 'object'
      || !('adminUserId' in value)
      || value.adminUserId !== adminUserId
      || !('accountVersion' in value)
      || value.accountVersion !== accountVersion
      || !('sessionId' in value)
      || typeof value.sessionId !== 'string'
      || !value.sessionId
      || !('createdAt' in value)
      || typeof value.createdAt !== 'string'
    ) {
      throw new Error();
    }

    const createdAt = new Date(value.createdAt);

    if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== value.createdAt) {
      throw new Error();
    }

    return { createdAt, sessionId: value.sessionId };
  } catch {
    throw new BusinessError(BusinessErrorCode.Validation, 'Invalid authentication session cursor');
  }
}

export function adminAuthRecords(models: IAdminAuthModels, session: ClientSession):
Omit<IAdminAuthTransaction, keyof IAdminUserTransaction | 'findByEmail'> {
  return {
    findSessionByDigest: async (tokenDigest) => {
      const row = await models.sessions.findOne({ tokenDigest }).session(session).lean().exec();

      return row ? fromRecord(row) : null;
    },
    findSessionById: async (sessionId) => {
      const row = await models.sessions.findOne({ _id: sessionId }).session(session).lean().exec();

      return row ? fromRecord(row) : null;
    },
    createSession: async (authSession) => {
      await models.sessions.create([sessionRecord(authSession)], { session });
    },
    saveSession: async (authSession) => {
      const { _id, ...fields } = sessionRecord(authSession);
      const result = await models.sessions.updateOne({
        _id,
        adminUserId: fields.adminUserId,
        tokenDigest: fields.tokenDigest,
        accountVersion: fields.accountVersion,
      }, { $set: fields }, { session }).exec();

      if (result.matchedCount !== 1) {
        throw new BusinessError(BusinessErrorCode.StaleWrite, 'Authentication session changed');
      }
    },
    listActiveSessions: async (adminUserId, accountVersion, at, limit, encoded) => {
      const cursor = encoded === null ? null : decodeCursor(encoded, adminUserId, accountVersion);
      const rows = await models.sessions.find({
        adminUserId,
        accountVersion,
        revokedAt: null,
        expiresAt: { $gt: at },
        ...(cursor ? {
          $or: [{ createdAt: { $gt: cursor.createdAt } },
            { createdAt: cursor.createdAt, _id: { $gt: cursor.sessionId } }],
        } : {}),
      }).sort({ createdAt: 1, _id: 1 }).limit(limit + 1).session(session).lean().exec();
      const items = rows.slice(0, limit).map(fromRecord);
      const last = items.at(-1)?.toState();

      return {
        items,
        nextCursor: rows.length > limit && last ? Buffer.from(JSON.stringify({
          adminUserId, accountVersion, createdAt: last.createdAt.toISOString(), sessionId: last.sessionId,
        })).toString('base64url') : null,
      };
    },
    findLoginAttempt: async (loginKey) => {
      const row = await models.attempts.findOne({ _id: loginKey }).session(session).lean().exec();

      if (!row) {
        return null;
      }

      const { _id, ...fields } = row;

      return { ...fields, loginKey: _id };
    },
    saveLoginAttempt: async (attempt) => {
      const { loginKey, ...fields } = attempt;

      await models.attempts.updateOne({ _id: loginKey }, { $set: fields }, { session, upsert: true }).exec();
    },
    clearLoginAttempt: async (loginKey) => {
      await models.attempts.deleteOne({ _id: loginKey }, { session }).exec();
    },
  };
}
