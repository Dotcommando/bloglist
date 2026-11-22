import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runInNewContext } from 'node:vm';

import {
  FileFrontendSourceLocationsAdapter,
} from '../../src/adapters/outbound/rendering/files/frontend-source-locations.adapter.js';
import { FileRenderingSourceAdapter } from '../../src/adapters/outbound/rendering/files/rendering-source.adapter.js';
import { MarkdownConversionAdapter } from '../../src/adapters/outbound/rendering/html/markdown-conversion.adapter.js';
import { FrontendBuildAdapter } from '../../src/adapters/outbound/rendering/vite/frontend-build.adapter.js';
import { source } from '../support/publication.js';

describe('frontend source resource boundary', () => {
  it('preserves relative CSS assets, local script imports, output execution and source-root confinement', async () => {
    const root = await mkdtemp(path.resolve('.tmp/frontend-source-'));

    try {
      const site = path.join(root, 'example');
      const owner = path.join(site, 'templates', 'Home');

      await mkdir(owner, { recursive: true });
      await mkdir(path.join(site, 'assets'));
      await writeFile(path.join(site, 'site.config.json'), JSON.stringify({ siteId: 'site-1' }));
      await writeFile(path.join(owner, 'index.html'), '<html><head></head><body></body></html>');
      await writeFile(path.join(owner, 'styles.css'), '.hero{background-image:url(../../assets/photo.png)}');
      await writeFile(path.join(site, 'assets', 'photo.png'), 'synthetic image');
      await writeFile(path.join(owner, 'value.ts'), 'export const value: string = "done";');
      await writeFile(path.join(owner, 'client.ts'),
        'import {value} from "./value"; document.body.dataset.result = value;');
      const rendering = await new FileRenderingSourceAdapter(root).read('site-1');
      const input = {
        releaseId: 'release',
        snapshot: { ...source('Hello'), ...rendering },
        requestPlans: [],
        documents: [{
          pageId: 'page-1',
          html: '<html><head></head><body></body></html>',
          frontendSourceIds: ['site', 'templates/Home'],
        }],
      };
      const frontend = new FrontendBuildAdapter(undefined,
        new FileFrontendSourceLocationsAdapter(root), new MarkdownConversionAdapter());
      const result = await frontend.build(input);
      const media = result.artifacts.find((item) => item.path.startsWith('assets/media/'))!;
      const bytes = async (file: typeof media): Promise<string> => {
        const chunks: Uint8Array[] = [];

        for await (const chunk of file.content.bytes) {
          chunks.push(chunk);
        }

        return Buffer.concat(chunks).toString('utf8');
      };

      expect(await bytes(media)).toBe('synthetic image');
      const html = await bytes(result.artifacts.find((item) => item.mimeType === 'text/html')!);

      expect(html).toContain(media.path);
      const script = result.artifacts.find((item) => item.path.endsWith('.js'))!;
      const document = { body: { dataset: { result: '' } } };

      runInNewContext(await bytes(script), { document });
      expect(document.body.dataset.result).toBe('done');
      expect(JSON.stringify(rendering)).not.toContain('directory');
      const escaping = {
        ...input,
        snapshot: {
          ...input.snapshot,
          frontendSources: input.snapshot.frontendSources.map((item) => item.id === 'templates/Home'
            ? { ...item, browserTypeScript: 'import "../../../outside";' } : item),
        },
      };

      await writeFile(path.join(root, 'outside.ts'), 'document.body.dataset.result = "outside";');
      await expect(frontend.build(escaping)).rejects.toThrow(/escapes site sources/);
      expect(await readFile(path.join(root, 'outside.ts'), 'utf8')).toContain('outside');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
