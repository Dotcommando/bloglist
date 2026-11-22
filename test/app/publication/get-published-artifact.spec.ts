import { artifact } from '../../../src/adapters/outbound/rendering/vite/artifacts.js';
import { GetPublishedArtifactUseCase } from '../../../src/app/use-cases/publication/get-published-artifact.use-case.js';
import type { IPublishedArtifact } from '../../../src/domain/publication/published-artifact.js';

describe('GetPublishedArtifact', () => {
  it('selects the active release for sitemap.xml without exposing other unpinned documents', async () => {
    const sitemap = artifact('sitemap.xml', 'application/xml', '<urlset/>');
    const readPublicArtifact = vi.fn(async () => ({
      siteId: 'site',
      releaseId: 'active',
      metadata: sitemap,
      content: sitemap.content,
      inlineStyleHashes: [],
    }));
    const activation = {
      getActive: vi.fn(async () => ({ siteId: 'site', releaseId: 'active', activatedAt: new Date() })),
      activate: vi.fn(),
      findActivation: vi.fn(async () => ({ siteId: 'site', releaseId: 'active', activatedAt: new Date() })),
    };
    const operation = new GetPublishedArtifactUseCase({ readPublicArtifact }, activation, { findRelease: vi.fn() });

    expect((await operation.execute({
      siteId: 'site',
      releaseId: null,
      path: 'sitemap.xml',
    }))?.releaseId).toBe('active');
    expect(await operation.execute({ siteId: 'site', releaseId: null, path: 'index.html' })).toBeNull();
    expect(readPublicArtifact).toHaveBeenCalledOnce();
  });
  const file = artifact('assets/a.hash.css', 'text/css', 'body{color:red}');
  const result: IPublishedArtifact = {
    siteId: 'site',
    releaseId: 'old',
    metadata: file,
    content: file.content,
    inlineStyleHashes: [],
  };

  it('delivers a pinned previously activated artifact without selecting the newer active pointer', async () => {
    const readPublicArtifact = vi.fn(async () => result);
    const getActive = vi.fn();
    const operation = new GetPublishedArtifactUseCase({ readPublicArtifact }, {
      getActive,
      activate: vi.fn(),
      findActivation: async () => ({
        siteId: 'site',
        releaseId: 'old',
        activatedAt: new Date(),
      }),
    }, { findRelease: async () => 'old' });

    expect(await operation.execute({ siteId: 'site', releaseId: 'old', path: file.path })).toBe(result);
    expect(getActive).not.toHaveBeenCalled();
    expect((await operation.execute({ siteId: 'site', releaseId: null, path: file.path }))?.releaseId).toBe('old');
  });
  it('does not read unactivated data or expose private metadata returned by an invalid adapter', async () => {
    const readPublicArtifact = vi.fn(async () => ({ ...result, metadata: { ...file, public: false } }));
    const activation = { getActive: vi.fn(), activate: vi.fn(), findActivation: vi.fn(async () => null) };
    const operation = new GetPublishedArtifactUseCase({ readPublicArtifact }, activation,
      { findRelease: async () => null });

    expect(await operation.execute({ siteId: 'site', releaseId: 'old', path: file.path })).toBeNull();
    expect(readPublicArtifact).not.toHaveBeenCalled();
    await expect(operation.execute({ siteId: 'site', releaseId: 'old', path: '../private.json' })).rejects.toThrow();
  });
});
