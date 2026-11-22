import type { IPublicationReleaseState } from '../src/domain/publication/publication-release.js';
import { PublicationRelease, ReleaseState } from '../src/domain/publication/publication-release.js';
import { PublishedRouteKind } from '../src/domain/publication/published-route.js';

function release(): IPublicationReleaseState {
  return {
    siteId: 'site',
    releaseId: 'release',
    state: ReleaseState.Staged,
    manifest: null,
    failure: null,
    createdAt: new Date('2026-10-24T10:00:00Z'),
    completedAt: null,
  };
}

describe('publication release invariants', () => {
  it('completes an immutable snapshot with page routes and preserved redirects', () => {
    const entity = new PublicationRelease(release());

    entity.complete({
      artifacts: [{ path: 'index.html', mimeType: 'text/html', byteSize: 10, checksum: 'hash', public: true }],
      routes: [{
        kind: PublishedRouteKind.Static,
        urlId: 'home',
        path: '/',
        pageId: 'home-page',
        documentPath: 'index.html',
      },
      { kind: PublishedRouteKind.Redirect, urlId: 'old', path: '/old/', targetUrlId: 'home', status: 301 }],
    }, new Date('2026-10-24T10:01:00Z'));
    expect(entity.toState().state).toBe(ReleaseState.Ready);
    expect(() => entity.fail('late failure', new Date('2026-10-24T10:02:00Z'))).toThrow();
    entity.toState().createdAt.setUTCFullYear(2000);
    expect(entity.toState().createdAt.getUTCFullYear()).toBe(2026);
  });

  it('rejects a broken redirect graph without completing the release', () => {
    const entity = new PublicationRelease(release());

    expect(() => entity.complete({
      artifacts: [],
      routes: [
        { kind: PublishedRouteKind.Redirect, urlId: 'a', path: '/a/', targetUrlId: 'b', status: 301 },
        { kind: PublishedRouteKind.Redirect, urlId: 'b', path: '/b/', targetUrlId: 'a', status: 308 },
      ],
    }, new Date('2026-10-24T10:01:00Z'))).toThrow();
    expect(entity.toState().state).toBe(ReleaseState.Staged);
  });

  it('rejects private/missing documents and path traversal', () => {
    for (const publicDocument of [true, false]) {
      expect(() => new PublicationRelease(release()).complete({
        artifacts: [{
          path: publicDocument ? '../private.html' : 'private.html',
          mimeType: 'text/html',
          byteSize: 10,
          checksum: 'hash',
          public: publicDocument,
        }],
        routes: [{
          kind: PublishedRouteKind.Static,
          urlId: 'home',
          path: '/',
          pageId: 'home-page',
          documentPath: 'private.html',
        }],
      }, new Date('2026-10-24T10:01:00Z'))).toThrow();
    }
  });
});
