import { randomUUID } from 'node:crypto';
import { lstat, mkdir, rename, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { PublishedRouteKind } from '../../../../domain/publication/published-route.js';
import type { ISiteDeployment } from '../../../../domain/publication/site-deployment.js';
import { requireAssetPath, requireCondition } from '../../../../domain/shared/validation.js';
import type {
  ISiteDeploymentOutputPort, ISiteDeploymentOutputResult,
} from '../../../../ports/outbound/publication/site-deployment-output.port.js';
import { fileStyleHashes } from '../../rendering/html/file-style-hashes.js';
import { fileContent, writeFileContent } from '../../storage/files/binary-file.js';
import { assertNoLinks, fileMissing, readDeploymentOwner, withDeploymentLock } from './deployment-files.js';

export interface ICloudflareDeploymentSettings {
  readonly outputRoot: string;
  readonly siteId: string;
  readonly workerName: string;
  readonly publicOrigin: string;
  readonly backendOrigin: string;
  readonly mediaPath: string;
}

const maxStaticFileBytes = 25 * 1024 * 1024;

export class CloudflareDeploymentAdapter implements ISiteDeploymentOutputPort {
  constructor(private readonly settings: ICloudflareDeploymentSettings, private readonly workerSource: string) {}

  async write(deployment: ISiteDeployment): Promise<ISiteDeploymentOutputResult> {
    requireCondition(deployment.siteId === this.settings.siteId, 'Foreign deployment site');
    requireCondition(deployment.publicOrigin ? deployment.publicOrigin === this.settings.publicOrigin
      : new URL(this.settings.publicOrigin).hostname === deployment.primaryDomain,
    'Deployment origin must match the site serving address');

    return withDeploymentLock(this.settings.outputRoot, () => this.prepare(deployment));
  }

  private async prepare(deployment: ISiteDeployment): Promise<ISiteDeploymentOutputResult> {
    const root = this.settings.outputRoot;
    const stage = path.join(path.dirname(root), '.' + path.basename(root) + '.preparing');
    const previous = path.join(path.dirname(root), '.' + path.basename(root) + '.previous');
    const exists = async (directory: string): Promise<boolean> => {
      try {
        await lstat(directory);

        return true;
      } catch (error) {
        if (!fileMissing(error)) {
          throw error;
        }

        return false;
      }
    };
    const removeOwned = async (directory: string): Promise<void> => {
      await readDeploymentOwner(directory, deployment.siteId);
      await rm(directory, { recursive: true });
    };

    if (await exists(previous)) {
      await readDeploymentOwner(previous, deployment.siteId);

      if (!await exists(root)) {
        await rename(previous, root);
      } else {
        await readDeploymentOwner(root, deployment.siteId);
        await removeOwned(previous);
      }
    }
    if (await exists(root)) {
      await readDeploymentOwner(root, deployment.siteId);
    }
    if (await exists(stage)) {
      await removeOwned(stage);
    }
    await assertNoLinks(stage);
    await mkdir(stage);
    const owner = {
      format: 'zarya-site-deployment',
      version: 1,
      exportId: randomUUID(),
      siteId: deployment.siteId,
      releaseId: deployment.releaseId,
    };

    try {
      await writeFile(path.join(stage, '.zarya-deployment.json'), JSON.stringify(owner));
      const publicRoot = path.join(stage, 'public');
      const installed = new Map<string, { path: string; checksum: string; byteSize: number; mimeType: string }>();
      const originFiles: string[] = [];

      await mkdir(publicRoot);

      for (const file of deployment.files) {
        requireAssetPath(file.path);
        requireCondition(!file.path.split('/').some((part) => part.startsWith('.'))
          && !/^(?:plans|diagnostics|api|admin)(?:\/|$)/.test(file.path)
          && file.path !== 'manifest.json', 'Private or reserved deployment file');

        if (['_headers', '_redirects'].includes(file.path)) {
          continue;
        }
        if (file.content.byteSize > maxStaticFileBytes) {
          const mediaPrefix = this.settings.mediaPath.slice(1) + '/';

          requireCondition(file.path.startsWith(mediaPrefix + 'images/')
            || file.path.startsWith(mediaPrefix + 'files/'),
          'Publication file exceeds Cloudflare Static Assets 25 MiB limit');
          originFiles.push('/' + file.path);
          continue;
        }

        const transfer = path.join(stage, '.transfer-' + randomUUID());
        const { byteSize: size, checksum } = await writeFileContent(transfer, file.content, maxStaticFileBytes);

        requireCondition(size === file.content.byteSize && (!file.checksum || checksum === file.checksum),
          'Deployment content checksum or size mismatch');
        const key = file.path.normalize('NFC').toLowerCase();
        const existing = installed.get(key);

        requireCondition(!existing || existing.path === file.path && existing.checksum === checksum,
          'Conflicting deployment paths');

        if (existing) {
          await unlink(transfer);
          continue;
        }

        const target = path.join(publicRoot, ...file.path.split('/'));

        await mkdir(path.dirname(target), { recursive: true });
        await rename(transfer, target);
        installed.set(key, { path: file.path, checksum, byteSize: size, mimeType: file.content.mimeType });
      }
      const staticPolicies: Record<string, string> = {};
      const staticDocuments: Record<string, {
        documentPath: string; markdownPath?: string; mimeType: string; noindex: boolean;
      }> = {};
      const redirects: Record<string, { target: string; status: 301 | 308 }> = {};
      const requestPaths: string[] = [];

      for (const route of deployment.routes) {
        const routePath = encodeURI(route.path);

        if (route.kind === PublishedRouteKind.Static) {
          const file = installed.get(route.documentPath.normalize('NFC').toLowerCase());

          requireCondition(file?.path === route.documentPath, 'Missing static deployment document');

          if (route.markdownPath) {
            const markdown = installed.get(route.markdownPath.normalize('NFC').toLowerCase());

            requireCondition(file!.mimeType === 'text/html' && markdown?.path === route.markdownPath
              && markdown.mimeType === 'text/markdown', 'Missing Markdown deployment document');
          }
          staticDocuments[routePath] = {
            documentPath: route.documentPath,
            mimeType: file!.mimeType,
            noindex: route.robotsIndex === false,
            ...(route.markdownPath ? { markdownPath: route.markdownPath } : {}),
          };
          const hashes = file!.mimeType === 'text/html'
            ? await fileStyleHashes(fileContent(path.join(publicRoot, file!.path), file!.byteSize, file!.mimeType))
            : [];

          staticPolicies[routePath] = "script-src 'self'; style-src 'self' "
            + hashes.map((hash) => "'" + hash + "'").join(' ') + "; object-src 'none'; base-uri 'self'";
        } else if (route.kind === PublishedRouteKind.Request) {
          requestPaths.push(routePath);
        } else {
          const target = route.targetPath ?? deployment.routes.find((item) => item.urlId === route.targetUrlId)?.path;

          requireCondition(target !== undefined, 'Missing deployment redirect target');
          redirects[routePath] = { target: target!, status: route.status };
        }
      }
      const routing = {
        publicOrigin: this.settings.publicOrigin,
        backendOrigin: this.settings.backendOrigin,
        mediaPath: this.settings.mediaPath,
        requestPaths,
        staticPolicies,
        staticDocuments,
        redirects,
      };
      const runFirst = [...new Set(['/api', '/api/*', '/admin', '/admin/*',
        ...Object.keys(staticPolicies), ...requestPaths, ...Object.keys(redirects)])];
      const origin = new URL(this.settings.publicOrigin);
      const configuration = {
        name: this.settings.workerName,
        main: './worker.mjs',
        compatibility_date: '2026-10-31',
        workers_dev: false,
        preview_urls: false,
        ...(origin.protocol === 'https:' ? { routes: [{ pattern: origin.hostname, custom_domain: true }] } : {}),
        assets: { directory: './public', binding: 'ASSETS', run_worker_first: runFirst },
      };

      await writeFile(path.join(publicRoot, '_redirects'), '/assets/releases/:release/* /assets/:splat 200\n');
      await writeFile(path.join(publicRoot, '_headers'),
        '/*\n  X-Content-Type-Options: nosniff\n'
        + '/assets/styles/*\n  Cache-Control: public, max-age=31536000, immutable\n'
        + '/assets/scripts/*\n  Cache-Control: public, max-age=31536000, immutable\n');
      await writeFile(path.join(stage, 'routing.json'), JSON.stringify(routing, null, 2) + '\n');
      await writeFile(path.join(stage, 'runtime.mjs'), this.workerSource);
      await writeFile(path.join(stage, 'worker.mjs'), "import {createCloudflareWorker} from './runtime.mjs';\n"
        + "import routing from './routing.json';\nexport default createCloudflareWorker(routing);\n");
      await writeFile(path.join(stage, 'wrangler.json'), JSON.stringify(configuration, null, 2) + '\n');
      await writeFile(path.join(stage, '.zarya-deployment.json'),
        JSON.stringify({ ...owner, originFiles }, null, 2) + '\n');
      const hadPrevious = await exists(root);

      if (hadPrevious) {
        await rename(root, previous);
      }

      try {
        await rename(stage, root);
      } catch (error) {
        if (hadPrevious) {
          await rename(previous, root);
        }
        throw error;
      }

      // Keep at most one previous complete export; the next preparation removes it under the same lock.
      return {
        directory: path.join(root, 'public'),
        files: installed.size + 2,
        exportId: owner.exportId,
        ...(originFiles.length ? { originFiles } : {}),
      };
    } catch (error) {
      if (await exists(stage)) {
        // This stage was created by this invocation, even if writing its marker failed.
        await assertNoLinks(stage);
        await rm(stage, { recursive: true });
      }
      throw error;
    }
  }
}
