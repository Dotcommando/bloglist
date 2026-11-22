import { virtualUrlChildren } from '../../src/domain/routing/virtual-url.policy.js';
import { pageFixture } from '../support/pages.js';
import { urlFixture } from '../support/routing.js';

describe('virtual folder adoption policy', () => {
  const parent = pageFixture('parent').toState();
  const first = { ...pageFixture('first').toState(), parentPageId: null };
  const deep = { ...pageFixture('deep').toState(), parentPageId: 'first' };
  const second = { ...pageFixture('second').toState(), parentPageId: null };
  const urls = [urlFixture({ pageId: 'first', path: '/example/one' }).toState(),
    urlFixture({ pageId: 'deep', path: '/example/one/deep' }).toState(),
    urlFixture({ pageId: 'second', path: '/example/two' }).toState()];
  const snapshot = { siteId: 'site-1', urls, pages: [parent, first, deep, second] };
  const next = urlFixture({ pageId: 'parent', path: '/example/' }).toState();

  it('adopts only branch roots and preserves existing deeper hierarchy', () => {
    expect(virtualUrlChildren(snapshot, next)).toEqual(['first', 'second']);
    expect(deep.parentPageId).toBe('first');
  });
  it('rejects occupied prefixes, cross-site states and cycles before mutation', () => {
    expect(() => virtualUrlChildren({ ...snapshot, urls: [...urls, next] }, next)).toThrow();
    expect(() => virtualUrlChildren({ ...snapshot, siteId: 'foreign' }, next)).toThrow();
    expect(() => virtualUrlChildren({
      ...snapshot,
      pages: [
        { ...parent, parentPageId: 'first' }, first, deep, second,
      ],
    }, next)).toThrow();
    expect(() => virtualUrlChildren(snapshot, { ...next, path: '/unrelated/' })).toThrow();
  });
});
