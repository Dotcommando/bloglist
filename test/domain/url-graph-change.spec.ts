import { OldUrlAction } from '../../src/domain/routing/old-url-action.enum.js';
import { planUrlGraphChange } from '../../src/domain/routing/url-graph-change.policy.js';
import { UrlKind } from '../../src/domain/routing/url-kind.enum.js';
import { ChildrenUrlAction, IncomingRedirectAction } from '../../src/domain/routing/url-move-options.js';
import { urlFixture } from '../support/routing.js';

describe('URL deletion and nested page disposition', () => {
  const root = urlFixture({ urlId: 'root', mark: 'Root', path: '/section/old/' });
  const replacement = urlFixture({ urlId: 'new', mark: 'New', path: '/section/new/' });
  const child = urlFixture({
    urlId: 'child',
    mark: 'Child',
    pageId: 'p2',
    parentUrlId: 'root',
    path:
    '/section/old/item/',
  });
  const grand = urlFixture({
    urlId: 'grand',
    mark: 'Grand',
    pageId: 'p3',
    parentUrlId: 'child',
    path:
    '/section/old/item/detail/',
  });
  const alias = urlFixture({
    urlId: 'alias',
    mark: 'Alias',
    pageId: null,
    kind: UrlKind.REDIRECT,
    redirectTargetUrlId: 'root',
    redirectStatus: 301,
    path: '/alias/',
  });
  const alias2 = urlFixture({
    ...alias.toState(),
    urlId: 'alias2',
    mark: 'AliasTwo',
    path: '/alias-2/',
    redirectTargetUrlId: 'alias',
  });
  const originals = [root, child, grand, alias, alias2].map((url) => url.toState());
  const identities = new Map([['child', { urlId: 'child-new', mark: 'ChildNew' }],
    ['grand', { urlId: 'grand-new', mark: 'GrandNew' }]]);

  it('keeps nested paths and reattaches children when the old parent is deleted', () => {
    const result = planUrlGraphChange(root, replacement, originals, identities, {
      oldUrlAction: OldUrlAction.Delete,
      childrenAction: ChildrenUrlAction.Keep,
      incomingRedirectAction: IncomingRedirectAction.Retarget,
      redirectStatus: 301,
    });

    expect(result.next.some((url) => url.urlId === 'root')).toBe(false);
    expect(result.next.find((url) => url.urlId === 'child')).toMatchObject({ path: child.path, parentUrlId: 'new' });
    expect(result.next.filter((url) => url.kind === UrlKind.REDIRECT).map((url) => url.redirectTargetUrlId))
      .toEqual(['new', 'new']);
  });
  it('promotes nested address paths even when their optional parent references are absent', () => {
    const captured = originals.map((url) => ({ ...url, parentUrlId: null }));
    const result = planUrlGraphChange(root, replacement, captured, identities, {
      oldUrlAction: OldUrlAction.Redirect,
      childrenAction: ChildrenUrlAction.PromoteWithoutRedirect,
      incomingRedirectAction: IncomingRedirectAction.Retarget,
      redirectStatus: 301,
    });

    expect(result.next.find((url) => url.urlId === 'child-new')).toMatchObject({
      path: '/section/item/', parentUrlId: null,
    });
    expect(result.next.find((url) => url.urlId === 'grand-new')).toMatchObject({
      path: '/section/item/detail/', parentUrlId: null,
    });
    expect(result.next.some((url) => url.urlId === 'child' || url.urlId === 'grand')).toBe(false);
  });
  it.each([ChildrenUrlAction.PromoteWithRedirect,
    ChildrenUrlAction.PromoteWithoutRedirect])('removes the old parent segment: %s', (childrenAction) => {
    const result = planUrlGraphChange(root, replacement, originals, identities, {
      oldUrlAction: OldUrlAction.Delete,
      childrenAction,
      incomingRedirectAction: IncomingRedirectAction.Delete,
      redirectStatus: 301,
    });

    expect(result.next.find((url) => url.urlId === 'child-new')).toMatchObject({
      path: '/section/item/',
      parentUrlId: null,
    });
    expect(result.next.find((url) => url.urlId === 'grand-new')).toMatchObject({
      path: '/section/item/detail/',
      parentUrlId: 'child-new',
    });
    expect(result.next.some((url) => url.urlId === 'child')).toBe(childrenAction
      === ChildrenUrlAction.PromoteWithRedirect);
    expect(result.next.some((url) => url.urlId === 'alias' || url.urlId === 'alias2')).toBe(false);
  });
  it('rejects occupied promoted paths and foreign data without mutating the source', () => {
    const collision = urlFixture({
      urlId: 'occupied', mark: 'Occupied', path: '/section/item/', pageId: 'other',
    }).toState();

    expect(() => planUrlGraphChange(root, replacement, [...originals, collision], identities, {
      oldUrlAction: OldUrlAction.Redirect,
      childrenAction: ChildrenUrlAction.PromoteWithRedirect,
      incomingRedirectAction: IncomingRedirectAction.Retarget,
      redirectStatus: 301,
    })).toThrow();
    expect(originals[0]?.kind).toBe(UrlKind.PAGE);
  });
});
