import {
  MediaAddressReleaseBuildAdapter,
} from '../../src/adapters/outbound/publication/files/media-address-release-build.adapter.js';
import { decodePlan } from '../../src/adapters/outbound/publication/files/plan-decoder.js';
import { prepareCompiledAssets } from '../../src/adapters/outbound/rendering/html/inline-style-hashes.js';
import { artifact } from '../../src/adapters/outbound/rendering/vite/artifacts.js';
import type { IPublicationArtifact } from '../../src/domain/publication/publication-artifact.js';
import { ReleaseState } from '../../src/domain/publication/publication-release.js';
import { PublishedRouteKind } from '../../src/domain/publication/published-route.js';
import { requestPlanFixture } from '../support/delivery.js';
import { instant } from '../support/sites.js';

async function text(file: IPublicationArtifact): Promise<string> {
  const chunks = [];

  for await (const chunk of file.content.bytes) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString('utf8');
}

function fixture(): {
  files: IPublicationArtifact[];
  previous: Parameters<MediaAddressReleaseBuildAdapter['build']>[0]['previous'];
} {
  const old = '/assets/images/old.png';
  const frozen = requestPlanFixture();
  const files = [
    artifact('index.html', 'text/html', '<html><head></head><body><h1>Published text</h1><img src="' + old + '">'
      + '<link rel="stylesheet" href="/assets/releases/old/style.css"></body></html>'),
    artifact('assets/style.css', 'text/css', 'a{background:url(' + old + ')}'),
    artifact('assets/script.js', 'text/javascript', 'export const image="' + old + '";'),
    artifact('assets/pixel.png', 'image/png', new Uint8Array([1, 2, 3])),
    artifact('plans/page-1.json', 'application/json', JSON.stringify({
      ...frozen.plan,
      page: { ...frozen.plan.page, title: old, contentMd: 'Published ' + old },
      buildValues: { image: old, fixed: 'frozen Build output' },
      assets: prepareCompiledAssets({
        head: '<style>a{background:url(' + old + ')}</style>',
        body: '<script type="module" src="/assets/releases/old/script.js"></script>',
      }),
    }), false),
  ];

  return {
    files,
    previous: {
      siteId: 'site-1',
      releaseId: 'old',
      state: ReleaseState.Ready,
      createdAt: instant,
      completedAt: instant,
      failure: null,
      manifest: {
        routes: [
          { kind: PublishedRouteKind.Static, urlId: 'home', pageId: 'home', path: '/', documentPath: 'index.html' },
          {
            kind: PublishedRouteKind.Request,
            urlId: 'request',
            pageId: 'page-1',
            path: '/request/',
            renderPlanId: 'page-1',
          },
        ],
        artifacts: [...files],
      },
    },
  };
}

it('rewrites only frozen media URLs and rebases copied assets without executing drafts or Build loaders', async () => {
  const f = fixture();
  const result = await new MediaAddressReleaseBuildAdapter({ readArtifacts: async () => f.files }).build({
    siteId: 'site-1',
    releaseId: 'new',
    previous: f.previous,
    paths: [{ from: '/assets/images/old.png', to: '/assets/images/new.png' }],
    origins: [''],
  });

  expect(result.changed).toBe(true);
  expect(result.manifest.routes).toEqual(f.previous.manifest!.routes);
  const files = new Map(result.artifacts.map((file) => [file.path, file]));

  expect(await text(files.get('index.html')!)).toContain('<h1>Published text</h1><img src="/assets/images/new.png">');
  expect(await text(files.get('index.html')!)).toContain('/assets/releases/new/style.css');
  expect(await text(files.get('assets/style.css')!)).toContain('/assets/images/new.png');
  expect(await text(files.get('assets/script.js')!)).toContain('/assets/images/new.png');
  expect(files.get('assets/pixel.png')).toBe(f.files[3]);
  const plan = decodePlan(JSON.parse(await text(files.get('plans/page-1.json')!)));

  expect(plan.plan.buildValues).toEqual({ image: '/assets/images/new.png', fixed: 'frozen Build output' });
  expect(plan.plan.page.title).toBe('/assets/images/old.png');
  expect(plan.plan.page.contentMd).toBe('Published /assets/images/new.png');
  expect(plan.assets.body).toContain('/assets/releases/new/script.js');
  expect(plan.assets.inlineStyles?.[0]?.content).toContain('/assets/images/new.png');
  expect(await text(f.files[0]!)).toContain('/assets/images/old.png');
});

it('adds and removes favicon links in frozen static HTML and Request plans without changing Build values', async () => {
  const f = fixture();
  const icon = { byteSize: 100, width: 32, height: 32, version: 'a'.repeat(64) };
  const input = {
    siteId: 'site-1', releaseId: 'icon', previous: f.previous, paths: [], origins: [''], favicon: icon,
  };
  const built = await new MediaAddressReleaseBuildAdapter({ readArtifacts: async () => f.files }).build(input);

  expect(built.changed).toBe(true);
  const html = await text(built.artifacts.find((file) => file.path === 'index.html')!);

  expect(html).toContain('href="/favicon.ico?v=' + icon.version + '"');
  const plan = decodePlan(JSON.parse(await text(built.artifacts.find((file) => file.path.startsWith('plans/'))!)));

  expect(plan.assets.head).toContain('data-zarya-favicon');
  expect(plan.plan.buildValues).toEqual({ image: '/assets/images/old.png', fixed: 'frozen Build output' });
  const removed = await new MediaAddressReleaseBuildAdapter({ readArtifacts: async () => built.artifacts }).build({
    ...input,
    releaseId: 'removed',
    previous: { ...f.previous, releaseId: 'icon', manifest: built.manifest },
    favicon: null,
  });

  expect(removed.changed).toBe(true);
  expect(await text(removed.artifacts.find((file) => file.path === 'index.html')!)).not.toContain('favicon');
  const restoredFile = removed.artifacts.find((file) => file.path.startsWith('plans/'))!;
  const restored = decodePlan(JSON.parse(await text(restoredFile)));

  expect(restored.assets.head).not.toContain('favicon');
  expect(restored.plan.buildValues).toEqual(plan.plan.buildValues);
});

it('rejects failed and truncated frozen streams without producing a replacement release', async () => {
  const f = fixture();
  const file = f.files[0]!;
  const input = {
    siteId: 'site-1',
    releaseId: 'new',
    previous: f.previous,
    paths: [{ from: '/assets/images/old.png', to: '/assets/images/new.png' }],
    origins: [''],
  };
  const failed = {
    ...file,
    content: {
      ...file.content,
      bytes: {
        async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
          yield await Promise.reject<Uint8Array>(new Error('read rejected'));
        },
      },
    },
  };
  const build = new MediaAddressReleaseBuildAdapter({ readArtifacts: async () => [failed, ...f.files.slice(1)] });

  await expect(build.build(input)).rejects.toThrow('read rejected');
  failed.content.bytes = {
    async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
      yield new Uint8Array([1]);
    },
  };
  await expect(build.build(input)).rejects.toThrow('Truncated frozen text artifact');
});

it('retains an unaffected publication and rejects foreign or inconsistent artifact inventories', async () => {
  const f = fixture();
  const build = new MediaAddressReleaseBuildAdapter({ readArtifacts: async () => f.files });
  const input = {
    siteId: 'site-1',
    releaseId: 'new',
    previous: f.previous,
    paths: [{ from: '/assets/images/missing.png', to: '/assets/images/new.png' }],
    origins: [''],
  };

  expect((await build.build(input)).changed).toBe(false);
  await expect(build.build({ ...input, siteId: 'foreign' })).rejects.toThrow();
  f.files.pop();
  await expect(build.build(input)).rejects.toThrow();
});
