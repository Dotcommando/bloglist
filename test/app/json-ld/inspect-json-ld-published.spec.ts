import type { Mock } from 'vitest';

import {
  InspectJsonLdPublishedUseCase,
} from '../../../src/app/use-cases/json-ld/inspect-json-ld-published.use-case.js';
import {
  type IPublicationReleaseState, ReleaseState,
} from '../../../src/domain/publication/publication-release.js';
import type { IPublishedArtifact } from '../../../src/domain/publication/published-artifact.js';
import { PublishedRouteKind } from '../../../src/domain/publication/published-route.js';
import type { IGetPublishedArtifact } from '../../../src/ports/inbound/publication/get-published-artifact.port.js';
import type { IRenderPublishedPage } from '../../../src/ports/inbound/publication/render-published-page.port.js';
import type { IPublicationStorePort } from '../../../src/ports/outbound/publication/publication-store.port.js';
import type { IReleaseActivationPort } from '../../../src/ports/outbound/publication/release-activation.port.js';

interface IPublishedInspectionFixture {
  operation: InspectJsonLdPublishedUseCase;
  html: string;
  file: IPublishedArtifact;
  release: IPublicationReleaseState;
  getActive: Mock<IReleaseActivationPort['getActive']>;
  read: Mock<IPublicationStorePort['read']>;
  artifacts: Mock<IGetPublishedArtifact['execute']>;
  render: Mock<IRenderPublishedPage['execute']>;
  inspect: Mock<(html: string) => string | null>;
  authorize: Mock<(siteId: string, actorId: string) => Promise<void>>;
}

const input = { siteId: 'site', pageId: 'page', actorId: 'editor' };

function fixture(): IPublishedInspectionFixture {
  const html = '<html><head></head><body>Свет</body></html>';
  const bytes = new TextEncoder().encode(html);
  const first = bytes.indexOf(0xd0) + 1;
  const release: IPublicationReleaseState = {
    siteId: 'site',
    releaseId: 'active',
    state: ReleaseState.Ready,
    createdAt: new Date(0),
    completedAt: new Date(1),
    failure: null,
    manifest: {
      routes: [{
        kind: PublishedRouteKind.Static,
        urlId: 'url',
        pageId: 'page',
        path: '/',
        documentPath: 'index.html',
      }],
      artifacts: [],
    },
  };
  const file = {
    siteId: 'site',
    releaseId: 'active',
    inlineStyleHashes: [],
    metadata: { path: 'index.html', byteSize: bytes.length, mimeType: 'text/html', checksum: 'hash', public: true },
    content: {
      byteSize: bytes.length,
      mimeType: 'text/html',
      bytes: {
        async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
          yield bytes.subarray(0, first);
          yield bytes.subarray(first);
        },
      },
    },
  };
  const getActive = vi.fn<IReleaseActivationPort['getActive']>().mockResolvedValue({
    siteId: 'site', releaseId: 'active', activatedAt: new Date(1),
  });
  const read = vi.fn<IPublicationStorePort['read']>().mockResolvedValue(release);
  const artifacts = vi.fn<IGetPublishedArtifact['execute']>().mockResolvedValue(file);
  const render = vi.fn<IRenderPublishedPage['execute']>().mockResolvedValue({
    releaseId: 'active', pageId: 'page', html, inlineStyleHashes: [],
  });
  const inspect = vi.fn<(html: string) => string | null>().mockReturnValue('{"@graph":[]}');
  const authorize = vi.fn<(siteId: string, actorId: string) => Promise<void>>().mockResolvedValue(undefined);
  const operation = new InspectJsonLdPublishedUseCase({ assertEditor: authorize },
    { getActive, activate: vi.fn(), findActivation: vi.fn() }, { read, stage: vi.fn() },
    { execute: render }, { execute: artifacts }, { read: inspect });

  return { operation, html, file, release, getActive, read, artifacts, render, inspect, authorize };
}

it('inspects only the captured active static HTML and decodes split UTF-8 without rendering a draft', async () => {
  const f = fixture();

  expect(await f.operation.execute(input)).toEqual({ jsonLd: '{"@graph":[]}', warnings: [] });
  expect(f.getActive).toHaveBeenCalledExactlyOnceWith('site');
  expect(f.read).toHaveBeenCalledWith('site', 'active', true);
  expect(f.artifacts).toHaveBeenCalledWith({ siteId: 'site', releaseId: 'active', path: 'index.html' });
  expect(f.inspect).toHaveBeenCalledExactlyOnceWith(f.html);
  expect(f.render).not.toHaveBeenCalled();
});

it('renders a pinned Request publication once and rejects a foreign result before inspecting it', async () => {
  const f = fixture();
  const request: IPublicationReleaseState = {
    ...f.release,
    manifest: {
      artifacts: [],
      routes: [{
        kind: PublishedRouteKind.Request, urlId: 'url', pageId: 'page', path: '/', renderPlanId: 'plan',
      }],
    },
  };

  f.read.mockResolvedValue(request);
  await f.operation.execute(input);
  expect(f.render).toHaveBeenCalledExactlyOnceWith({ siteId: 'site', releaseId: 'active', renderPlanId: 'plan' });
  expect(f.artifacts).not.toHaveBeenCalled();
  f.inspect.mockClear();
  f.render.mockResolvedValueOnce({ releaseId: 'foreign', pageId: 'page', html: 'private', inlineStyleHashes: [] });
  await expect(f.operation.execute(input)).rejects.toThrow('Foreign published page');
  expect(f.inspect).not.toHaveBeenCalled();
});

it('rejects a denied editor before any publication read and distinguishes absent from foreign activation', async () => {
  const f = fixture();
  const failure = new Error('Denied');

  f.authorize.mockRejectedValueOnce(failure);
  await expect(f.operation.execute(input)).rejects.toBe(failure);
  expect(f.getActive).not.toHaveBeenCalled();
  expect(f.read).not.toHaveBeenCalled();
  f.getActive.mockResolvedValueOnce(null);
  await expect(f.operation.execute(input)).rejects.toMatchObject({ code: 'NotFound' });
  f.getActive.mockResolvedValueOnce({ siteId: 'foreign', releaseId: 'active', activatedAt: new Date(0) });
  await expect(f.operation.execute(input)).rejects.toThrow('Foreign active publication');
  expect(f.read).not.toHaveBeenCalled();
  expect(f.inspect).not.toHaveBeenCalled();
});

it.each(['truncated', 'invalid UTF-8', 'failed stream'])(
  'does not inspect partial or corrupt published HTML: %s', async (mode) => {
    const f = fixture();
    const failure = new Error('Published read failed');

    f.artifacts.mockResolvedValueOnce({
      ...f.file,
      content: {
        ...f.file.content,
        bytes: {
          async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
            yield mode === 'invalid UTF-8' ? new Uint8Array([255]) : new TextEncoder().encode('<html>');

            if (mode === 'failed stream') {
              throw failure;
            }
          },
        },
      },
    });

    if (mode === 'failed stream') {
      await expect(f.operation.execute(input)).rejects.toBe(failure);
    } else {
      await expect(f.operation.execute(input)).rejects.toThrow();
    }
    expect(f.inspect).not.toHaveBeenCalled();
    expect(f.render).not.toHaveBeenCalled();
  });
