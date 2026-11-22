import { MaterializeVirtualUrlUseCase } from '../../../src/app/use-cases/routing/materialize-virtual-url.use-case.js';
import { UrlKind } from '../../../src/domain/routing/url-kind.enum.js';
import type { IVirtualUrlSnapshot } from '../../../src/domain/routing/virtual-url.policy.js';
import type { IMaterializeVirtualUrlInput } from '../../../src/ports/inbound/routing/materialize-virtual-url.port.js';
import { fakeHookChanges } from '../../support/hooks.js';
import { pageFixture } from '../../support/pages.js';
import { urlFixture } from '../../support/routing.js';

describe('materialize virtual URL', () => {
  it('runs the routing check before creating a materialized redirect', async () => {
    const target = urlFixture({ path: '/example/child/', urlId: 'target' });
    const store = {
      read: async () => ({ siteId: target.siteId, urls: [target.toState()], pages: [] }),
      commit: vi.fn(async () => {}),
    };
    const operation = new MaterializeVirtualUrlUseCase(store, { assertEditor: async () => {} }, {
      nextUrlId: () => 'new', nextUrlMark: () => 'NewUrl', currentInstant: () => new Date(0),
    }, { execute: async () => null }, {
      prepare: async () => {
        throw new Error('Hook denial');
      },
    });

    await expect(operation.execute({
      siteId: target.siteId,
      actorId: 'editor',
      path: '/example/',
      kind: UrlKind.REDIRECT,
      targetUrlId: target.urlId,
      redirectStatus: 301,
    })).rejects.toThrow('Hook denial');
    expect(store.commit).not.toHaveBeenCalled();
  });
  it('adopts a page branch without publication and returns the binding on a retry', async () => {
    let snapshot: IVirtualUrlSnapshot = {
      siteId: 'site-1',
      urls: [urlFixture({ path: '/example/child/', pageId: 'child' }).toState()],
      pages: [pageFixture('parent').toState(), pageFixture('child').toState()],
    };
    const store = { read: vi.fn(async () => snapshot), commit: vi.fn(async () => {}) };
    const publish = { execute: vi.fn(async () => null) };
    const operation = new MaterializeVirtualUrlUseCase(store, { assertEditor: async () => {} }, {
      nextUrlId: () => 'new', nextUrlMark: () => 'NewUrl', currentInstant: () => new Date('2026-10-28T00:00:00Z'),
    }, publish, fakeHookChanges);
    const input: IMaterializeVirtualUrlInput = {
      siteId: 'site-1', actorId: 'editor', kind: UrlKind.PAGE, pageId: 'parent', path: '/example',
    };
    const saved = await operation.execute(input);

    expect(store.commit).toHaveBeenCalledWith(snapshot, expect.anything(), ['child'],
      expect.objectContaining({ siteId: 'site-1' }));
    expect(publish.execute).not.toHaveBeenCalled();
    snapshot = { ...snapshot, urls: [...snapshot.urls, saved.url.toState()] };
    expect((await operation.execute(input)).url.toState()).toEqual(saved.url.toState());
    expect(store.commit).toHaveBeenCalledOnce();
  });
  it('authorizes before reading and creates a redirect without publishing page drafts', async () => {
    const target = urlFixture({ path: '/example/child/', urlId: 'target' });
    const store = {
      read: vi.fn(async () => ({ siteId: target.siteId, urls: [target.toState()], pages: [] })),
      commit: vi.fn(async () => {}),
    };
    const publish = { execute: vi.fn(async () => null) };
    const access = { assertEditor: vi.fn(async () => {}) };
    const operation = new MaterializeVirtualUrlUseCase(store, access, {
      nextUrlId: () => 'new', nextUrlMark: () => 'NewUrl', currentInstant: () => new Date('2026-10-28T00:00:00Z'),
    }, publish, fakeHookChanges);
    const result = await operation.execute({
      siteId: target.siteId,
      actorId: 'editor',
      path: '/example/',
      kind: UrlKind.REDIRECT,
      targetUrlId: target.urlId,
      redirectStatus: 301,
    });

    expect(result.url.path).toBe('/example/');
    expect(store.commit).toHaveBeenCalledWith(expect.anything(), expect.anything(), [],
      expect.objectContaining({ siteId: 'site-1' }));
    expect(publish.execute).toHaveBeenCalledOnce();
    publish.execute.mockRejectedValueOnce(new Error('Activation failed'));
    expect(await operation.execute({
      siteId: target.siteId,
      actorId: 'editor',
      path: '/example/',
      kind: UrlKind.REDIRECT,
      targetUrlId: target.urlId,
      redirectStatus: 301,
    })).toMatchObject({ publication: null, publicationFailed: true });
    access.assertEditor.mockRejectedValueOnce(new Error('Denied'));
    await expect(operation.execute({
      siteId: target.siteId,
      actorId: 'editor',
      path: '/example/',
      kind: UrlKind.REDIRECT,
      targetUrlId: target.urlId,
      redirectStatus: 301,
    })).rejects.toThrow('Denied');
    expect(store.read).toHaveBeenCalledTimes(2);
  });
});
