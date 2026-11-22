import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import type { ClientSession } from 'mongoose';

import type { IHookCommitIntent } from '../../../../../domain/hooks/hook-execution.js';
import { isSystemDocumentPath } from '../../../../../domain/pages/document-mime.js';
import { OldUrlAction } from '../../../../../domain/routing/old-url-action.enum.js';
import { RoutingConflictError } from '../../../../../domain/routing/routing-conflict.error.js';
import { RoutingNotFoundError } from '../../../../../domain/routing/routing-not-found.error.js';
import { type IUrlState, Url } from '../../../../../domain/routing/url.js';
import { type IUrlGraphChange, validateUrlGraph } from '../../../../../domain/routing/url-graph-change.policy.js';
import type { IUrlHistoryEntry } from '../../../../../domain/routing/url-history-entry.js';
import { UrlKind } from '../../../../../domain/routing/url-kind.enum.js';
import type { IVersionedUrl } from '../../../../../domain/routing/versioned-url.js';
import { requireText } from '../../../../../domain/shared/validation.js';
import type {
  IChangePageUrlPersistence, IDescendantUrlMove, IUrlRepository,
} from '../../../../../ports/outbound/routing/url.repository.js';
import type {
  IUrlBehaviorChange, IUrlBehaviorStorePort,
} from '../../../../../ports/outbound/routing/url-behavior-store.port.js';
import type { MongooseHookEvents } from '../hooks/hook-events.adapter.js';
import { recordHookChange } from '../hooks/hook-mutation.js';
import type { IRoutingModels, IUrlRecord } from './routing.models.js';

export function toRecord(url: Url): IUrlRecord {
  const { urlId, ...state } = url.toState();

  return { ...state, _id: urlId, markKey: state.mark.toLowerCase(), version: randomUUID() };
}

export function toUrl(record: IUrlRecord): Url {
  return new Url({
    urlId: record._id,
    mark: record.mark,
    siteId: record.siteId,
    parentUrlId: record.parentUrlId,
    segment: record.segment,
    path: record.path,
    kind: record.kind,
    pageId: record.pageId,
    redirectTargetUrlId: record.redirectTargetUrlId,
    redirectStatus: record.redirectStatus,
    firstPublishedAt: record.firstPublishedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

function urlVersion(record: IUrlRecord): string {
  return record.version
    ?? 'legacy:' + createHash('sha256').update(JSON.stringify(toUrl(record).toState())).digest('hex');
}

export class MongooseUrlRepository implements IUrlRepository, IUrlBehaviorStorePort {
  constructor(private readonly models: IRoutingModels, private readonly now: () => Date,
    private readonly historyId: () => string, private readonly hookEvents?: MongooseHookEvents) {}

  async findVersionedUrl(siteId: string, urlId: string): Promise<IVersionedUrl | null> {
    const record = await this.models.urls.findOne({ _id: urlId, siteId }).lean().exec();

    return record ? { url: toUrl(record).toState(), version: urlVersion(record) } : null;
  }

  async commitBehaviorChange(change: IUrlBehaviorChange): Promise<void> {
    const previous = new Url(change.previous).toState();
    const next = new Url(change.next);
    const expected = {
      ...previous,
      kind: next.kind,
      pageId: next.pageId,
      redirectTargetUrlId: next.redirectTargetUrlId,
      redirectStatus: next.redirectStatus,
      updatedAt: next.updatedAt,
    };

    if (change.siteId !== previous.siteId || !isDeepStrictEqual(expected, next.toState())) {
      throw new RoutingConflictError('URL behavior changed immutable identity');
    }
    requireText(change.nextVersion, 'nextVersion');
    requireText(change.expectedVersion, 'expectedVersion');
    requireText(change.history.urlHistoryEntryId, 'history identity');
    const history = {
      urlHistoryEntryId: change.history.urlHistoryEntryId,
      urlId: previous.urlId,
      kind: previous.kind,
      pageId: previous.pageId,
      redirectTargetUrlId: previous.redirectTargetUrlId,
      redirectStatus: previous.redirectStatus,
      createdAt: next.updatedAt,
    };

    if (change.nextVersion === change.expectedVersion || !isDeepStrictEqual(history, change.history)) {
      throw new RoutingConflictError('Invalid behavior version or history');
    }
    await this.transact(change.siteId, async (session) => {
      const row = await this.models.urls.findOne({ _id: previous.urlId, siteId: change.siteId })
        .session(session).lean().exec();

      if (!row || urlVersion(row) !== change.expectedVersion || !isDeepStrictEqual(toUrl(row).toState(), previous)) {
        throw new RoutingConflictError('URL version changed');
      }
      await this.verifyReferences(next, session, new Map([[next.urlId, next]]));
      const { urlHistoryEntryId, ...fields } = history;

      await this.models.history.insertOne({ ...fields, _id: urlHistoryEntryId, siteId: change.siteId }, { session });
      const updated = await this.models.urls.updateOne({ _id: next.urlId, siteId: change.siteId }, {
        $set: {
          kind: next.kind,
          pageId: next.pageId,
          redirectTargetUrlId: next.redirectTargetUrlId,
          redirectStatus: next.redirectStatus,
          updatedAt: next.updatedAt,
          version: change.nextVersion,
        },
      }, { session, runValidators: true }).exec();

      if (updated.matchedCount !== 1) {
        throw new RoutingConflictError('URL disappeared');
      }
    }, change.hookChange);
  }

  async findById(urlId: string): Promise<Url | null> {
    const record = await this.models.urls.findOne({ _id: urlId }).lean().exec();

    return record ? toUrl(record) : null;
  }

  async findByMark(mark: string): Promise<Url | null> {
    const record = await this.models.urls.findOne({ markKey: mark.toLowerCase() }).lean().exec();

    return record ? toUrl(record) : null;
  }

  async findByPath(siteId: string, path: string): Promise<Url | null> {
    const record = await this.models.urls.findOne({ siteId, path }).lean().exec();

    return record ? toUrl(record) : null;
  }

  async findCurrentByPage(pageId: string): Promise<Url | null> {
    const record = await this.models.urls.findOne({ pageId, kind: UrlKind.PAGE }).lean().exec();

    return record ? toUrl(record) : null;
  }

  async findChildren(parentUrlId: string): Promise<Url[]> {
    const parent = await this.findById(parentUrlId);

    if (!parent) {
      return [];
    }

    const records = await this.models.urls.find({ siteId: parent.siteId, parentUrlId }).sort({ _id: 1 }).lean().exec();

    return records.map(toUrl);
  }

  async getHistory(urlId: string): Promise<IUrlHistoryEntry[]> {
    const url = await this.findById(urlId);

    if (!url) {
      throw new RoutingNotFoundError('URL not found');
    }

    const records = await this.models.history.find({ siteId: url.siteId, urlId })
      .sort({ createdAt: 1, _id: 1 }).lean().exec();

    return records.map((record) => ({
      urlHistoryEntryId: record._id,
      urlId: record.urlId,
      kind: record.kind,
      pageId: record.pageId,
      redirectTargetUrlId: record.redirectTargetUrlId,
      redirectStatus: record.redirectStatus,
      createdAt: new Date(record.createdAt),
    }));
  }

  async save(url: Url, hookChange?: IHookCommitIntent): Promise<Url> {
    return this.transact(url.siteId, async (session) => {
      const existing = await this.models.urls.findOne({ _id: url.urlId }).session(session).lean().exec();

      await this.verifyReferences(url, session, new Map([[url.urlId, url]]));

      if (!existing) {
        return toUrl((await this.models.urls.insertOne(toRecord(url), { session })).toObject());
      }

      const previous = toUrl(existing).toState();
      const next = url.toState();

      if (
        ['siteId', 'mark', 'path', 'segment', 'parentUrlId'].some((key) =>
          Reflect.get(previous, key) !== Reflect.get(next, key))
        || previous.createdAt.getTime() !== next.createdAt.getTime()
        || previous.firstPublishedAt.getTime() !== next.firstPublishedAt.getTime()
      ) {
        throw new RoutingConflictError('Immutable URL fields differ');
      }

      const changedAt = this.now();

      if (
        previous.kind !== next.kind
        || previous.pageId !== next.pageId
        || previous.redirectTargetUrlId !== next.redirectTargetUrlId
        || previous.redirectStatus !== next.redirectStatus
      ) {
        await this.recordHistory(previous, changedAt, session);
      }

      const saved = await this.models.urls.findOneAndUpdate({ _id: url.urlId, siteId: url.siteId },
        {
          $set: {
            kind: next.kind,
            pageId: next.pageId,
            redirectTargetUrlId: next.redirectTargetUrlId,
            redirectStatus: next.redirectStatus,
            updatedAt: changedAt,
            version: randomUUID(),
          },
        },
        { returnDocument: 'after', runValidators: true, upsert: false, session }).lean().exec();

      if (!saved) {
        throw new RoutingConflictError('URL disappeared during persistence');
      }

      return toUrl(saved);
    }, hookChange);
  }

  async changePageUrl(change: IChangePageUrlPersistence): Promise<void> {
    const root = new Url(change.previousUrl);

    if (isSystemDocumentPath(root.path) || isSystemDocumentPath(change.newUrl.path)) {
      throw new RoutingConflictError('System document URLs are fixed');
    }

    const moves: readonly IDescendantUrlMove[] = [change, ...(change.descendants ?? [])];

    if (change.moveSubtree !== true && moves.length !== 1) {
      throw new RoutingConflictError('Descendants require an explicit subtree move');
    }
    if (root.kind !== UrlKind.PAGE || change.newUrl.kind !== UrlKind.PAGE || root.pageId !== change.newUrl.pageId) {
      throw new RoutingConflictError('Expected the old and new PAGE address for the same page');
    }
    await this.transact(root.siteId, async (session) => {
      if (change.graphChange) {
        if (
          !isDeepStrictEqual(change.graphChange.previous.find((url) => url.urlId === root.urlId), root.toState())
          || !isDeepStrictEqual(change.graphChange.next.find((url) => url.urlId === change.newUrl.urlId),
            change.newUrl.toState())
        ) {
          throw new RoutingConflictError('Graph does not contain the captured move');
        }
        await this.commitGraphChange(root.siteId, change.graphChange, change.changedAt, session);

        return;
      }
      if (change.oldUrlAction === OldUrlAction.Delete) {
        throw new RoutingConflictError('Deletion requires a complete captured graph');
      }

      const prepared = new Map(moves.map((move) => [move.newUrl.urlId, move.newUrl]));
      const oldIds = new Set(moves.map((move) => move.previousUrl.urlId));

      if (
        prepared.size !== moves.length
        || oldIds.size !== moves.length
        || [...prepared.keys()].some((id) => oldIds.has(id))
      ) {
        throw new RoutingConflictError('Move identities must be distinct and new');
      }
      if (change.moveSubtree === true) {
        const actual = await this.descendants(root, session);

        if (actual.length !== moves.length - 1 || actual.some((url) => !oldIds.has(url.urlId))) {
          throw new RoutingConflictError('Subtree membership changed');
        }
      }

      for (const move of moves) {
        const previous = new Url(move.previousUrl);

        if (
          previous.siteId !== root.siteId
          || move.newUrl.siteId !== root.siteId
          || previous.kind !== move.newUrl.kind
          || previous.pageId !== move.newUrl.pageId
        ) {
          throw new RoutingConflictError('Move changed ownership or page binding');
        }

        const current = await this.models.urls.findOne({ _id: previous.urlId, siteId: root.siteId })
          .session(session).lean().exec();

        if (!current || !isDeepStrictEqual(toUrl(current).toState(), previous.toState())) {
          throw new RoutingConflictError('Stale previous URL state');
        }
        if (await this.models.urls.findOne({ _id: move.newUrl.urlId }).session(session).lean().exec()) {
          throw new RoutingConflictError('Replacement URL identity already exists');
        }
        await this.verifyReferences(move.newUrl, session, prepared);
      }

      for (const move of moves) {
        const redirect = new Url(move.previousUrl);

        redirect.redirectTo(move.newUrl.urlId, change.redirectStatus);
        await this.recordHistory(move.previousUrl, change.changedAt, session);
        const updated = await this.models.urls.updateOne({ _id: redirect.urlId, siteId: root.siteId },
          {
            $set: {
              kind: UrlKind.REDIRECT,
              pageId: null,
              redirectTargetUrlId: move.newUrl.urlId,
              redirectStatus: change.redirectStatus,
              updatedAt: change.changedAt,
              version: randomUUID(),
            },
          },
          { session, runValidators: true }).exec();

        if (updated.matchedCount !== 1) {
          throw new RoutingConflictError('URL disappeared during move');
        }
      }

      for (const move of moves) {
        await this.models.urls.insertOne(toRecord(move.newUrl), { session });
      }
    }, change.hookChange);
  }

  private async commitGraphChange(siteId: string, change: IUrlGraphChange, at: Date,
    session: ClientSession): Promise<void> {
    validateUrlGraph(siteId, change.previous);
    validateUrlGraph(siteId, change.next);
    const records = await this.models.urls.find({ siteId }).session(session).lean().exec();
    const original = new Map(change.previous.map((url) => [url.urlId, url]));

    if (
      records.length !== original.size
      || records.some((row) =>
        !isDeepStrictEqual(toUrl(row).toState(), original.get(row._id)))
    ) {
      throw new RoutingConflictError('URL graph changed');
    }

    const next = new Map(change.next.map((url) => [url.urlId, url]));
    const deleted = change.previous.filter((url) => !next.has(url.urlId)).map((url) => url.urlId);

    if (deleted.length) {
      const removed = await this.models.urls.deleteMany({ siteId, _id: { $in: deleted } }, { session }).exec();

      if (removed.deletedCount !== deleted.length) {
        throw new RoutingConflictError('URL disappeared during deletion');
      }
      await this.models.history.deleteMany({ siteId, urlId: { $in: deleted } }, { session }).exec();
    }

    for (const url of change.next) {
      const previous = original.get(url.urlId);

      if (!previous || isDeepStrictEqual(previous, url)) {
        continue;
      }
      if (
        ['mark', 'path', 'segment'].some((key) => Reflect.get(previous, key) !== Reflect.get(url, key))
        || previous.createdAt.getTime() !== url.createdAt.getTime()
        || previous.firstPublishedAt.getTime() !== url.firstPublishedAt.getTime()
      ) {
        throw new RoutingConflictError('Related update changed immutable address identity');
      }
      await this.recordHistory(previous, at, session);
      const result = await this.models.urls.updateOne({ siteId, _id: url.urlId }, {
        $set: {
          parentUrlId: url.parentUrlId,
          kind: url.kind,
          pageId: url.pageId,
          redirectTargetUrlId: url.redirectTargetUrlId,
          redirectStatus: url.redirectStatus,
          updatedAt: url.updatedAt,
          version: randomUUID(),
        },
      }, { session, runValidators: true, overwriteImmutable: true }).exec();

      if (result.matchedCount !== 1) {
        throw new RoutingConflictError('Related URL disappeared');
      }
    }

    for (const url of change.next.filter((url) => !original.has(url.urlId))) {
      await this.models.urls.insertOne(toRecord(new Url(url)), { session });
    }
  }

  private async recordHistory(previous: IUrlState, at: Date, session: ClientSession): Promise<void> {
    await this.models.history.insertOne({
      _id: this.historyId(),
      siteId: previous.siteId,
      urlId: previous.urlId,
      kind: previous.kind,
      pageId: previous.pageId,
      redirectTargetUrlId: previous.redirectTargetUrlId,
      redirectStatus: previous.redirectStatus,
      createdAt: at,
    },
    { session });
  }

  private async descendants(root: Url, session: ClientSession): Promise<Url[]> {
    const result: Url[] = [];
    const queue = [root.urlId];
    const visited = new Set(queue);

    for (const parentUrlId of queue) {
      const children = await this.models.urls.find({ siteId: root.siteId, parentUrlId }).session(session).lean().exec();

      for (const record of children) {
        if (visited.has(record._id)) {
          throw new RoutingConflictError('Cyclic URL hierarchy');
        }
        visited.add(record._id);
        queue.push(record._id);
        result.push(toUrl(record));
      }
    }

    return result;
  }

  private async verifyReferences(url: Url, session: ClientSession, prepared: ReadonlyMap<string, Url>): Promise<void> {
    for (const relationship of ['parent', 'redirect']) {
      const visited = new Set([url.urlId]);
      let nextId = relationship === 'parent' ? url.parentUrlId : url.redirectTargetUrlId;

      while (nextId !== null) {
        if (visited.has(nextId)) {
          throw new RoutingConflictError('Cyclic URL relationship');
        }
        visited.add(nextId);
        let target = prepared.get(nextId);

        if (!target) {
          const record = await this.models.urls.findOne({ _id: nextId, siteId: url.siteId })
            .session(session).lean().exec();

          if (record) {
            target = toUrl(record);
          }
        }
        if (target?.siteId !== url.siteId) {
          throw new RoutingConflictError('Missing or foreign URL relationship');
        }
        nextId = relationship === 'parent' ? target.parentUrlId : target.redirectTargetUrlId;
      }
    }
  }

  private async transact<T>(siteId: string, work: (session: ClientSession) => Promise<T>, hookChange?:
  IHookCommitIntent): Promise<T> {
    const session = await this.models.connection.startSession();

    try {
      for (let attempt = 0; ; attempt++) {
        let commitAttempted = false;

        try {
          session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
          const at = this.now();

          await this.models.versions.updateOne({ _id: siteId }, {
            $inc: { revision: 1 },
            $set: { updatedAt: at },
            $setOnInsert: { siteId, createdAt: at },
          },
          { upsert: true, session, runValidators: true, setDefaultsOnInsert: false }).exec();
          const result = await work(session);

          await recordHookChange(this.hookEvents, hookChange, session);
          commitAttempted = true;
          await session.commitTransaction();

          return result;
        } catch (error) {
          if (!commitAttempted && session.inTransaction()) {
            await session.abortTransaction().catch(() => undefined);
          }
          if (
            !commitAttempted
            && error instanceof Error
            && 'code' in error
            && [11000, 112, 251].includes(Number(error.code))
          ) {
            if (error.code === 112 && attempt < 2) {
              await new Promise((resolve) => setTimeout(resolve, 50 * 2 ** attempt));
              continue;
            }
            throw new RoutingConflictError('Concurrent routing state or uniqueness conflict');
          }
          throw error;
        }
      }
    } finally {
      // Cleanup must not turn an acknowledged commit into a failed business command.
      await session.endSession().catch(() => undefined);
    }
  }
}
