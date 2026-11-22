import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  CloudflareDeploymentAdapter,
} from '../../src/adapters/outbound/deployment/cloudflare/cloudflare-deployment.adapter.js';
import { withDeploymentLock } from '../../src/adapters/outbound/deployment/cloudflare/deployment-files.js';
import { artifact } from '../../src/adapters/outbound/rendering/vite/artifacts.js';
import type { IPublicationArtifact } from '../../src/domain/publication/publication-artifact.js';
import { PublishedRouteKind } from '../../src/domain/publication/published-route.js';
import type { ISiteDeployment } from '../../src/domain/publication/site-deployment.js';

describe('complete Cloudflare deployment output', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'zarya-cdn-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function setup(): {
    writer: CloudflareDeploymentAdapter;
    outputRoot: string;
    deployment: ISiteDeployment;
    html: IPublicationArtifact;
  } {
    const outputRoot = path.join(root, 'deploy');
    const settings = {
      outputRoot,
      siteId: 'site-1',
      workerName: 'synthetic-site',
      publicOrigin: 'https://example.test',
      backendOrigin: 'https://origin.test',
      mediaPath: '/assets',
    };
    const writer = new CloudflareDeploymentAdapter(settings, 'export function createCloudflareWorker() {}');
    const html = artifact('index.html', 'text/html',
      '<html><head><style>body{margin:0}</style></head><body>Ready</body></html>');
    const deployment: ISiteDeployment = {
      siteId: 'site-1',
      releaseId: 'first',
      primaryDomain: 'example.test',
      routes: [
        { kind: PublishedRouteKind.Static, urlId: 'home', pageId: 'home', path: '/', documentPath: 'index.html' },
        {
          kind: PublishedRouteKind.Request,
          urlId: 'live',
          pageId: 'live',
          path: '/schedule/',
          renderPlanId: 'private-plan',
        },
        {
          kind: PublishedRouteKind.Redirect,
          urlId: 'old',
          path: '/old/',
          targetUrlId: 'home',
          targetPath: '/',
          status: 301,
        },
      ],
      files: [{ path: html.path, content: html.content, checksum: html.checksum }],
    };

    return { writer, outputRoot, deployment, html };
  }

  it('records the static Markdown artifact in the Worker routing', async () => {
    const f = setup();
    const markdown = artifact('representations/home.md', 'text/markdown', '# Ready');

    await f.writer.write({
      ...f.deployment,
      routes: [{
        kind: PublishedRouteKind.Static,
        urlId: 'home',
        pageId: 'home',
        path: '/',
        documentPath: 'index.html',
        markdownPath: markdown.path,
      }],
      files: [...f.deployment.files, { path: markdown.path, content: markdown.content, checksum: markdown.checksum }],
    });
    const routing = JSON.parse(await readFile(path.join(f.outputRoot, 'routing.json'), 'utf8'));

    expect(routing.staticDocuments['/'].markdownPath).toBe(markdown.path);
  });
  it('writes a fixed complete public root and Worker configuration without private plans', async () => {
    const f = setup();

    await expect(f.writer.write(f.deployment)).resolves.toMatchObject({ directory: path.join(f.outputRoot, 'public') });
    const config = JSON.parse(await readFile(path.join(f.outputRoot, 'wrangler.json'), 'utf8'));
    const routing = JSON.parse(await readFile(path.join(f.outputRoot, 'routing.json'), 'utf8'));

    expect(config.assets.directory).toBe('./public');
    expect(config.name).toBe('synthetic-site');
    expect(routing.requestPaths).toEqual(['/schedule/']);
    expect(routing.staticPolicies['/']).toContain('sha256-');
    expect(routing.redirects['/old/']).toEqual({ target: '/', status: 301 });
    expect(JSON.stringify(routing)).not.toContain('private-plan');
    expect(await readFile(path.join(f.outputRoot, 'public/index.html'), 'utf8')).toContain('Ready');
    await expect(readFile(path.join(f.outputRoot, 'public/routing.json'))).rejects.toThrow();
  });

  it('replaces the whole output and preserves the last good tree on failed preparation', async () => {
    const f = setup();

    await f.writer.write(f.deployment);
    await writeFile(path.join(f.outputRoot, 'public/obsolete.html'), 'old');
    await f.writer.write({ ...f.deployment, releaseId: 'second' });
    await expect(readFile(path.join(f.outputRoot, 'public/obsolete.html'))).rejects.toThrow();
    const corrupt = artifact('broken.html', 'text/html', 'Broken');

    await expect(f.writer.write({
      ...f.deployment,
      releaseId: 'third',
      files: [{ path: corrupt.path, content: corrupt.content, checksum: 'wrong' }],
    })).rejects.toThrow();
    const owner = JSON.parse(await readFile(path.join(f.outputRoot, '.zarya-deployment.json'), 'utf8'));

    expect(owner.releaseId).toBe('second');
    expect(await readFile(path.join(f.outputRoot, 'public/index.html'), 'utf8')).toContain('Ready');
  });

  it('distinguishes competing exports of the same publication for upload concurrency checks', async () => {
    const f = setup();
    const first = await f.writer.write(f.deployment);
    const second = await f.writer.write(f.deployment);

    expect(first.exportId).not.toBe(second.exportId);
  });

  it('refuses path escapes, private paths, foreign sites and an unowned existing directory', async () => {
    const f = setup();

    for (const bad of ['../outside', '.private/source.json', 'plans/code.json', 'api/admin/index.html']) {
      await expect(f.writer.write({
        ...f.deployment, files: [{ path: bad, content: f.html.content }],
      })).rejects.toThrow();
    }
    await expect(f.writer.write({ ...f.deployment, siteId: 'other' })).rejects.toThrow();
    await mkdir(f.outputRoot);
    await writeFile(path.join(f.outputRoot, 'owner.txt'), 'keep');
    await expect(f.writer.write(f.deployment)).rejects.toThrow();
    expect(await readFile(path.join(f.outputRoot, 'owner.txt'), 'utf8')).toBe('keep');
  });

  it('reports oversized public media as origin-served and rejects oversized page artifacts', async () => {
    const f = setup();
    const large = {
      byteSize: 25 * 1024 * 1024 + 1,
      mimeType: 'application/pdf',
      bytes: (async function* () {
        yield new Uint8Array(0);
      })(),
    };
    const result = await f.writer.write({
      ...f.deployment, files: [...f.deployment.files, { path: 'assets/files/large.pdf', content: large }],
    });

    expect(result.originFiles).toEqual(['/assets/files/large.pdf']);
    await expect(readFile(path.join(f.outputRoot, 'public/assets/files/large.pdf'))).rejects.toThrow();
    await expect(f.writer.write({
      ...f.deployment, files: [{ path: 'large.html', content: large }],
    })).rejects.toThrow('25 MiB');
  });

  it('serializes upload/preparation and refuses symbolic-link output ancestors', async () => {
    const f = setup();

    await withDeploymentLock(f.outputRoot, async () => {
      await expect(f.writer.write(f.deployment)).rejects.toThrow('busy');
    });
    const outside = path.join(root, 'keep');

    await mkdir(outside);
    await writeFile(path.join(outside, 'owner.txt'), 'keep');
    await symlink(outside, f.outputRoot, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(f.writer.write(f.deployment)).rejects.toThrow('symbolic');
    expect(await readFile(path.join(outside, 'owner.txt'), 'utf8')).toBe('keep');
  });
});
