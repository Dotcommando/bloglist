import { type Mocked, vi } from 'vitest';

import { Url } from '../../src/domain/routing/url.js';
import { BusinessError, BusinessErrorCode } from '../../src/domain/shared/business-error.js';
import type { IPageLookupPort } from '../../src/ports/outbound/routing/page-lookup.port.js';
import type { IUrlBehaviorStorePort } from '../../src/ports/outbound/routing/url-behavior-store.port.js';
import type {
  IUrlBehaviorAccessPort, IUrlBehaviorValuesPort,
} from '../../src/ports/outbound/routing/url-behavior-values.port.js';
import { FakeUrlRepository, urlFixture } from './routing.js';
import { instant } from './sites.js';

interface IBehaviorFixture {
  urls: FakeUrlRepository;
  versions: Map<string, string>;
  store: IUrlBehaviorStorePort;
  access: Mocked<IUrlBehaviorAccessPort>;
  values: IUrlBehaviorValuesPort;
  pages: Mocked<IPageLookupPort>;
}

export function behaviorFixture(): IBehaviorFixture {
  const urls = new FakeUrlRepository();

  urls.records.set('url-old', urlFixture());
  const versions = new Map([['url-old', 'v1']]);
  const store: IUrlBehaviorStorePort = {
    findVersionedUrl: vi.fn(async (siteId, id) => {
      const url = await urls.findById(id);

      return url && url.siteId === siteId ? { url: url.toState(), version: versions.get(id) ?? 'v1' } : null;
    }),
    commitBehaviorChange: vi.fn(async (change) => {
      if ((versions.get(change.previous.urlId) ?? 'v1') !== change.expectedVersion) {
        throw new BusinessError(BusinessErrorCode.StaleWrite, 'Changed');
      }
      await urls.save(new Url(change.next));
      urls.history.set(change.previous.urlId, [...urls.history.get(change.previous.urlId) ?? [], change.history]);
      versions.set(change.previous.urlId, change.nextVersion);
    }),
  };
  const access = {
    requireEditor: vi.fn(async (siteId: string, actorId: string) => {
      if (siteId !== 'site-1' || actorId !== 'operator') {
        throw new BusinessError(BusinessErrorCode.Forbidden, 'Denied');
      }
    }),
  };
  let sequence = 0;
  const values = {
    nextHistoryId: () => 'history-' + ++sequence,
    nextVersion: () => 'next-' + ++sequence,
    currentInstant: () => new Date(instant.getTime() + 1000),
  };
  const pages = { findPage: vi.fn(async (siteId: string, pageId: string) => ({ siteId, pageId })) };

  return { urls, versions, store, access, values, pages };
}
