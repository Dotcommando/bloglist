import { type Connection, mongo } from 'mongoose';

import { assertPageParent, isPageNumber, maximumPageNumber } from '../../../../../domain/pages/page-tree.policy.js';

interface ILegacyPage {
  readonly _id: string;
  readonly siteId: string;
  readonly createdAt: Date;
  readonly pageNumber?: string;
  readonly parentPageId?: string | null;
  readonly sortOrder?: number;
}

interface ILegacyUrl {
  readonly _id: string;
  readonly siteId: string;
  readonly pageId: string | null;
  readonly parentUrlId: string | null;
  readonly path: string;
}

/** Versioned data recipe PageTreeV1; run only through the explicit migration runner. */
export async function migratePageTree(connection: Connection): Promise<void> {
  const db = connection.db;

  if (!db) {
    throw new Error('Expected an open migration database');
  }

  const pages = await db.collection<ILegacyPage>('pages').find({})
    .sort({ siteId: 1, createdAt: 1, _id: 1 }).toArray();
  const urls = await db.collection<ILegacyUrl>('urls').find({ kind: 'PAGE' })
    .sort({ path: 1, _id: 1 }).toArray();
  const sites = [...new Set(pages.map((page) => page.siteId))];

  for (const siteId of sites) {
    const owned = pages.filter((page) => page.siteId === siteId);
    const addresses = urls.filter((url) => url.siteId === siteId);
    const assigned = new Set<string>();
    let maximum = 0n;

    for (const page of owned) {
      if (page.pageNumber === undefined) {
        continue;
      }
      if (!isPageNumber(page.pageNumber) || assigned.has(page.pageNumber)) {
        throw new Error('Invalid existing numeric page identity');
      }
      assigned.add(page.pageNumber);
      maximum = BigInt(page.pageNumber) > maximum ? BigInt(page.pageNumber) : maximum;
    }
    const positions = owned.map((page) => {
      const url = addresses.find((url) => url.pageId === page._id);
      const parent = addresses.find((candidate) => candidate._id === url?.parentUrlId);
      const parentId = parent?.pageId && parent.pageId !== page._id
        && owned.some((candidate) => candidate._id === parent.pageId) ? parent.pageId : null;

      return { pageId: page._id, siteId, parentPageId: page.parentPageId === undefined ? parentId : page.parentPageId };
    });
    const counts = new Map<string | null, number>();

    for (const page of owned) {
      const position = positions.find((position) => position.pageId === page._id)!;

      assertPageParent(siteId, page._id, position.parentPageId, positions);
      const order = (counts.get(position.parentPageId) ?? 0) + 100;

      counts.set(position.parentPageId, order);
      const pageNumber = page.pageNumber ?? (++maximum).toString();

      if (BigInt(pageNumber) > maximumPageNumber) {
        throw new Error('Numeric page identity exhausted');
      }
      await db.collection<ILegacyPage>('pages').updateOne({ _id: page._id, siteId }, {
        $set: {
          pageNumber, parentPageId: position.parentPageId, sortOrder: page.sortOrder ?? order,
        },
      });
      await db.collection<{ _id: string; siteId: string }>('page_publications')
        .updateOne({ _id: page._id, siteId }, { $set: { 'versions.$[].page.pageNumber': pageNumber } });
    }

    if (maximum > 0n) {
      await db.collection<{ _id: string; siteId: string; lastOrdinal: mongo.Long }>('page_sequences').updateOne(
        { _id: siteId }, {
          $max: { lastOrdinal: mongo.Long.fromString(maximum.toString()) },
          $setOnInsert: { siteId },
        }, { upsert: true });
    }
  }
}
