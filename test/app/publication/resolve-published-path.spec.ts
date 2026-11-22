import { ResolvePublishedPathUseCase } from '../../../src/app/use-cases/publication/resolve-published-path.use-case.js';
import { type IPublicationReleaseState, ReleaseState } from '../../../src/domain/publication/publication-release.js';
import { PublishedRouteKind } from '../../../src/domain/publication/published-route.js';

describe('ResolvePublishedPath', () => {
  it('distinguishes invalid caller paths from validation failures in stored release data', async () => {
    const operation = new ResolvePublishedPathUseCase({
      getActive: async () => ({
        siteId: 'site',
        releaseId: 'release',
        activatedAt: new Date(),
      }),
      activate: vi.fn(),
      findActivation: vi.fn(),
    },
    {
      read: async () => {
        throw new BusinessError(BusinessErrorCode.Validation, 'Corrupt stored bytes');
      },
      stage: vi.fn(),
    });

    await expect(operation.execute({ siteId: 'site', path: '/' })).rejects.toBeInstanceOf(PublicationConsistencyError);
    await expect(operation.execute({ siteId: 'site', path: '../private' })).rejects.toBeInstanceOf(RangeError);
  });
  it('selects one immutable release and resolves redirects within it', async () => {
    const getActive = vi.fn(async () => ({ siteId: 'site', releaseId: 'release', activatedAt: new Date() }));
    const read = vi.fn(async (): Promise<IPublicationReleaseState> => ({
      siteId: 'site',
      releaseId: 'release',
      state: ReleaseState.Ready,
      createdAt: new Date(),
      completedAt: new Date(),
      failure: null,
      manifest: {
        artifacts: [
          { path: 'index.html', public: true, mimeType: 'text/html', byteSize: 5, checksum: 'hash' },
          { path: 'representations/page.md', public: true, mimeType: 'text/markdown', byteSize: 5, checksum: 'hash' },
        ],
        routes: [{
          kind: PublishedRouteKind.Static,
          urlId: 'home',
          pageId: 'p',
          path: '/',
          documentPath: 'index.html',
          markdownPath: 'representations/page.md',
        },
        { kind: PublishedRouteKind.Redirect, urlId: 'old', path: '/old/', targetUrlId: 'home', status: 308 }],
      },
    }));
    const operation = new ResolvePublishedPathUseCase({
      getActive,
      activate: vi.fn(),
      findActivation: async () => null,
    },
    { read, stage: vi.fn() });

    expect(await operation.execute({ siteId: 'site', path: '/old/' })).toEqual({
      kind: 'Redirect', releaseId: 'release', targetPath: '/', status: 308,
    });
    expect(getActive).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledWith('site', 'release', true);
    expect(await operation.execute({ siteId: 'site', path: '/' })).toMatchObject({
      kind: 'StoredDocument', releaseId: 'release', markdownPath: 'representations/page.md',
    });
    expect(await operation.execute({ siteId: 'site', path: '/missing/' })).toEqual({ kind: 'NotFound' });
  });
  it('distinguishes missing publication from a corrupt pointer instead of serving drafts', async () => {
    const activation = { getActive: vi.fn(async () => null), activate: vi.fn(), findActivation: async () => null };
    const operation = new ResolvePublishedPathUseCase(activation, { read: async () => null, stage: vi.fn() });

    expect(await operation.execute({ siteId: 'site', path: '/' })).toEqual({ kind: 'NotFound' });
    const corrupt = new ResolvePublishedPathUseCase({
      ...activation,
      getActive: async () => ({ siteId: 'site', releaseId: 'missing', activatedAt: new Date() }),
    },
    { read: async () => null, stage: vi.fn() });

    await expect(corrupt.execute({ siteId: 'site', path: '/' })).rejects.toThrow();
  });
});

import { PublicationConsistencyError } from '../../../src/domain/publication/published-document.js';
import { BusinessError, BusinessErrorCode } from '../../../src/domain/shared/business-error.js';
