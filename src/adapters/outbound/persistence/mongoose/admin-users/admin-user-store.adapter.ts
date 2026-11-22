import { randomUUID } from 'node:crypto';

import { type Connection, type Model, Schema } from 'mongoose';

import { AdminUser, adminUserProfile, type IAdminUserState } from '../../../../../domain/admin-users/admin-user.js';
import {
  AdminUserListStatus,
  type IAdminUserListQuery,
  type IAdminUserProfile,
} from '../../../../../domain/admin-users/admin-user-profile.js';
import { BusinessError, BusinessErrorCode } from '../../../../../domain/shared/business-error.js';
import type { ICursorPage } from '../../../../../domain/shared/cursor-page.js';
import type { IAdminAuthTransaction } from '../../../../../ports/outbound/admin-auth/admin-auth-store.port.js';
import type {
  IAdminUserReaderPort,
  IAdminUserTransaction,
  IAdminUserUnitOfWorkPort,
} from '../../../../../ports/outbound/admin-users/admin-user-store.port.js';
import { adminAuthRecords, createAdminAuthModels, type IAdminAuthModels } from '../admin-auth/admin-auth.records.js';
import {
  assignInitialAdminRole, countActiveSystemAdministrators, readAdminAuthority,
} from '../authorization/admin-authority.adapter.js';
import { writeAuthorizationGuard } from '../authorization/content-access.adapter.js';
import type { MongooseHookEvents } from '../hooks/hook-events.adapter.js';

interface IAdminUserRecord extends Omit<IAdminUserState, 'adminUserId'> { readonly _id: string; }

interface IAdminUserLock { readonly _id: string; readonly nonce: string; }

interface ICursor { readonly createdAt: Date; readonly adminUserId: string; }

const schema = new Schema<IAdminUserRecord>({
  _id: { type: String, required: true },
  email: { type: String, required: true },
  passwordDigest: { type: String, required: true, select: false },
  allowedSiteIds: { type: [String], required: true },
  blocked: { type: Boolean, required: true },
  deletedAt: { type: Date, default: null },
  version: { type: String, required: true },
  createdAt: { type: Date, required: true },
  updatedAt: { type: Date, required: true },
}, { collection: 'admin_users', versionKey: false, autoCreate: false, autoIndex: false, strict: 'throw' });

const lockSchema = new Schema<IAdminUserLock>({ _id: String, nonce: String },
  { collection: 'admin_user_locks', versionKey: false, autoCreate: false, autoIndex: false, strict: 'throw' });

const profileProjection = Object.freeze({
  _id: 1,
  email: 1,
  allowedSiteIds: 1,
  blocked: 1,
  version: 1,
  createdAt: 1,
  updatedAt: 1,
  deletedAt: 1,
});

function record(user: AdminUser): IAdminUserRecord {
  const state = user.toState();

  return {
    _id: state.adminUserId,
    email: state.email,
    passwordDigest: state.passwordDigest,
    allowedSiteIds: [...state.allowedSiteIds],
    blocked: state.blocked,
    deletedAt: state.deletedAt,
    version: state.version,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  };
}

function profile(row: IAdminUserRecord): IAdminUserProfile {
  if (row.deletedAt !== null) {
    throw new BusinessError(BusinessErrorCode.Scope, 'Deleted administrator returned');
  }

  return adminUserProfile({
    adminUserId: row._id,
    email: row.email,
    allowedSiteIds: row.allowedSiteIds,
    blocked: row.blocked,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function duplicate(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 11000;
}

function decodeCursor(encoded: string, status: AdminUserListStatus): ICursor {
  try {
    if (encoded.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
      throw new Error();
    }

    const data: unknown = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));

    if (
      data === null
      || typeof data !== 'object'
      || !('createdAt' in data)
      || typeof data.createdAt !== 'string'
      || !('adminUserId' in data)
      || typeof data.adminUserId !== 'string'
      || !data.adminUserId
      || !('status' in data)
      || data.status !== status
    ) {
      throw new Error();
    }

    const createdAt = new Date(data.createdAt);

    if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== data.createdAt) {
      throw new Error();
    }

    return { createdAt, adminUserId: data.adminUserId };
  } catch {
    throw new BusinessError(BusinessErrorCode.Validation, 'Invalid administrator cursor');
  }
}

export class MongooseAdminUserStore implements IAdminUserReaderPort, IAdminUserUnitOfWorkPort {
  readonly users: Model<IAdminUserRecord>;
  readonly locks: Model<IAdminUserLock>;
  readonly sessions: IAdminAuthModels['sessions'];
  private readonly authModels: IAdminAuthModels;

  constructor(private readonly connection: Connection, private readonly hookEvents?: MongooseHookEvents) {
    this.users = connection.model<IAdminUserRecord>('AdminUser', schema);
    this.locks = connection.model<IAdminUserLock>('AdminUserLock', lockSchema);
    this.authModels = createAdminAuthModels(connection);
    this.sessions = this.authModels.sessions;
  }

  async findById(adminUserId: string): Promise<IAdminUserProfile | null> {
    const row = await this.users.findOne({ _id: adminUserId, deletedAt: null }).select(profileProjection).lean().exec();

    return row ? { ...profile(row), authorization: await readAdminAuthority(this.connection.db!, row._id) } : null;
  }

  async list(query: IAdminUserListQuery): Promise<ICursorPage<IAdminUserProfile>> {
    const cursor = query.cursor === null ? null : decodeCursor(query.cursor, query.status);
    const rows = await this.users.find({
      deletedAt: null,
      ...(query.status === AdminUserListStatus.All ? {} : { blocked: query.status === AdminUserListStatus.Blocked }),
      ...(cursor ? {
        $or: [{ createdAt: { $gt: cursor.createdAt } },
          { createdAt: cursor.createdAt, _id: { $gt: cursor.adminUserId } }],
      } : {}),
    }).select(profileProjection).sort({ createdAt: 1, _id: 1 }).limit(query.limit + 1).lean().exec();
    const items = rows.slice(0, query.limit).map(profile);
    const last = items.at(-1);

    return {
      items,
      nextCursor: rows.length > query.limit && last ? Buffer.from(JSON.stringify({
        createdAt: last.createdAt.toISOString(), adminUserId: last.adminUserId, status: query.status,
      })).toString('base64url') : null,
    };
  }

  async run<TResult>(work: (users: IAdminUserTransaction) => Promise<TResult>): Promise<TResult> {
    return this.runAuth(work);
  }

  async runAuth<TResult>(work: (users: IAdminAuthTransaction) => Promise<TResult>): Promise<TResult> {
    try {
      await this.locks.updateOne({ _id: 'global' }, { $setOnInsert: { nonce: randomUUID() } }, { upsert: true }).exec();
    } catch (error) {
      if (!duplicate(error)) {
        throw error;
      }
    }
    const session = await this.connection.startSession();

    try {
      return await session.withTransaction(async () => {
        const lock = await this.locks.updateOne({ _id: 'global' },
          { $set: { nonce: randomUUID() } }, { session }).exec();

        if (lock.matchedCount !== 1) {
          throw new BusinessError(BusinessErrorCode.Conflict, 'Administrator directory changed');
        }

        const users: IAdminAuthTransaction = {
          ...adminAuthRecords(this.authModels, session),
          findByEmail: async (email) => {
            const row = await this.users.findOne({ email, deletedAt: null })
              .select('+passwordDigest').collation({ locale: 'en', strength: 2 }).session(session).lean().exec();

            if (!row) {
              return null;
            }

            const { _id, ...state } = row;

            return new AdminUser({ ...state, adminUserId: _id });
          },
          findById: async (adminUserId) => {
            const row = await this.users.findOne({ _id: adminUserId, deletedAt: null })
              .select('+passwordDigest').session(session).lean().exec();

            if (!row) {
              return null;
            }

            const { _id, ...state } = row;

            return new AdminUser({ ...state, adminUserId: _id });
          },
          countActive: async () => countActiveSystemAdministrators(this.connection.db!, session),
          readAuthority: async (actorId) => readAdminAuthority(this.connection.db!, actorId, session),
          save: async (user, expectedVersion, hookChange, initialRole) => {
            const row = record(user);

            if (expectedVersion === null) {
              await this.users.create([row], { session });
              await assignInitialAdminRole(this.connection.db!, session, row._id, row.createdAt, initialRole);
            } else {
              const { _id, ...fields } = row;

              await writeAuthorizationGuard(this.connection.db!, 'actor:' + _id, session, true);
              const result = await this.users.updateOne({ _id, version: expectedVersion, deletedAt: null },
                { $set: fields }, { session }).exec();

              if (result.matchedCount !== 1) {
                throw new BusinessError(BusinessErrorCode.StaleWrite, 'Administrator changed');
              }
            }
            if (hookChange?.facts.length) {
              if (!this.hookEvents) {
                throw new Error('Installation hook persistence is not configured');
              }

              const installations = this.hookEvents.persistence.collection<{ _id: string }>('cms_installations');
              const completed = await installations.updateOne({
                _id: hookChange.installationId, setupState: 'Pending',
              }, {
                $set: {
                  setupState: 'Completed',
                  setupCompletedAt: hookChange.occurredAt,
                  setupCompletedBy: hookChange.actorId,
                  updatedAt: hookChange.occurredAt,
                  version: randomUUID(),
                },
              }, { session });

              if (completed.modifiedCount === 1) {
                await this.hookEvents.record(hookChange, session);
              }
            }
          },
        };

        return work(users);
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    } catch (error) {
      if (duplicate(error)) {
        throw new BusinessError(BusinessErrorCode.Conflict, 'Administrator email is already used');
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }
}
