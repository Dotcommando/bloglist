import { artifact } from '../../../src/adapters/outbound/rendering/vite/artifacts.js';
import {
  PrepareSiteDeploymentUseCase,
} from '../../../src/app/use-cases/publication/prepare-site-deployment.use-case.js';
import { ImageUploadMode } from '../../../src/domain/media/image-upload-mode.enum.js';
import { type IPublicationReleaseState, ReleaseState } from '../../../src/domain/publication/publication-release.js';
import { PublishedRouteKind } from '../../../src/domain/publication/published-route.js';
import type { IReleaseActivationPort } from '../../../src/ports/outbound/publication/release-activation.port.js';
import type {
  ISiteDeploymentOutputPort,
} from '../../../src/ports/outbound/publication/site-deployment-output.port.js';
import { siteFixture } from '../../support/sites.js';

describe('prepare a site deployment', () => {
  class Fixture {
    readonly html = artifact('index.html', 'text/html', '<html><head></head><body>Published</body></html>');
    readonly privateFile = artifact('plans/live.json', 'application/json', '{"secret":"private code"}', false);
    readonly release: IPublicationReleaseState = {
      siteId: 'site-1',
      releaseId: 'release-1',
      state: ReleaseState.Ready,
      manifest: {
        routes: [{
          kind: PublishedRouteKind.Static,
          urlId: 'url-1',
          pageId: 'page-1',
          path: '/',
          documentPath: 'index.html',
        }],
        artifacts: [this.html, this.privateFile],
      },
      siteKey: 'Example',
      failure: null,
      createdAt: new Date('2026-10-31T00:00:00Z'),
      completedAt: new Date('2026-10-31T00:00:00Z'),
    };
    readonly access = { assertEditor: vi.fn(async () => {}) };
    readonly sites = { execute: vi.fn(async () => siteFixture()) };
    readonly activation = {
      getActive: vi.fn<IReleaseActivationPort['getActive']>().mockResolvedValue({
        siteId: 'site-1', releaseId: 'release-1', activatedAt: this.release.createdAt,
      }),
    };
    readonly store = { read: vi.fn(async () => this.release) };
    readonly source = { readArtifacts: vi.fn(async () => [this.html, this.privateFile]) };
    readonly catalog = {
      version: 'media-1',
      pending: false,
      folders: [],
      files: [{
        fileId: 'file-1',
        name: 'banner.png',
        folderId: null,
        hasVariants: true,
        mode: ImageUploadMode.Responsive,
        mimeType: 'image/png',
        byteSize: 5,
        originalDimensions: null,
        outputs: [{
          key: 'w320',
          url: '/assets/images/banner--w320.webp',
          byteSize: 5,
          mimeType: 'image/webp',
          dimensions: null,
        }],
      }],
    };
    readonly media = {
      list: { execute: vi.fn(async () => this.catalog) },
      readContent: {
        execute: vi.fn(async () => ({
          content: artifact('image', 'image/webp', 'image').content,
          filename: 'banner.png',
        })),
      },
    };
    readonly output = {
      write: vi.fn<ISiteDeploymentOutputPort['write']>()
        .mockResolvedValue({ directory: '/synthetic/deploy/public', files: 2 }),
    };
    readonly operation = new PrepareSiteDeploymentUseCase(this.access, this.sites, this.activation,
      this.store, this.source, this.media, this.output);
  }

  function fixture(): Fixture {
    return new Fixture();
  }

  it('captures the active publication once and exports only public artifacts and named public media', async () => {
    const f = fixture();

    await expect(f.operation.execute({ siteId: 'site-1', actorId: 'operator' })).resolves.toEqual({
      siteId: 'site-1', releaseId: 'release-1', directory: '/synthetic/deploy/public', files: 2,
    });
    expect(f.activation.getActive).toHaveBeenCalledOnce();
    expect(f.media.readContent.execute).toHaveBeenCalledWith({ siteId: 'site-1', fileId: 'file-1', key: 'w320' });
    const written = f.output.write.mock.calls[0]?.[0];

    expect(written).toMatchObject({ siteId: 'site-1', releaseId: 'release-1', primaryDomain: 'example.test' });
    expect(written?.files.map((file) => file.path)).toEqual(['index.html', 'assets/images/banner--w320.webp']);
    expect(written?.files.some((file) => file.path.startsWith('plans/'))).toBe(false);
  });

  it('checks authorization before reading a site or publication', async () => {
    const f = fixture();

    f.access.assertEditor.mockRejectedValue(new Error('Forbidden'));
    await expect(f.operation.execute({ siteId: 'site-1' })).rejects.toThrow('Forbidden');
    expect(f.sites.execute).not.toHaveBeenCalled();
    expect(f.output.write).not.toHaveBeenCalled();
  });

  it('refuses a foreign publication or foreign media URL without replacing the output', async () => {
    const f = fixture();

    f.store.read.mockResolvedValue({ ...await f.store.read(), siteId: 'site-other' });
    await expect(f.operation.execute({ siteId: 'site-1' })).rejects.toThrow();
    expect(f.output.write).not.toHaveBeenCalled();
    const g = fixture();

    g.catalog.files[0]!.outputs[0]!.url = 'https://foreign.test/private';
    await expect(g.operation.execute({ siteId: 'site-1' })).rejects.toThrow();
    expect(g.output.write).not.toHaveBeenCalled();
  });

  it('requires an active publication and its complete public artifacts', async () => {
    const f = fixture();

    f.activation.getActive.mockResolvedValue(null);
    await expect(f.operation.execute({ siteId: 'site-1' })).rejects.toMatchObject({ code: 'NotFound' });
    expect(f.output.write).not.toHaveBeenCalled();
    const g = fixture();

    g.source.readArtifacts.mockResolvedValue([g.privateFile]);
    await expect(g.operation.execute({ siteId: 'site-1' })).rejects.toThrow();
    expect(g.output.write).not.toHaveBeenCalled();
  });

  it('rejects a changed or pending media catalog rather than mixing versions', async () => {
    const f = fixture();

    f.media.list.execute.mockResolvedValueOnce(f.catalog).mockResolvedValue({ ...f.catalog, version: 'media-2' });
    await expect(f.operation.execute({ siteId: 'site-1' })).rejects.toThrow();
    expect(f.output.write).not.toHaveBeenCalled();
    const g = fixture();

    g.catalog.pending = true;
    await expect(g.operation.execute({ siteId: 'site-1' })).rejects.toThrow();
    expect(g.output.write).not.toHaveBeenCalled();
  });
});
