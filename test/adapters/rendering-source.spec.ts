import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { FileRenderingSourceAdapter } from '../../src/adapters/outbound/rendering/files/rendering-source.adapter.js';

describe('trusted filesystem rendering sources', () => {
  it('maps configured site ownership and loads declared template/chunk contracts', async () => {
    const root = await mkdtemp(path.resolve('.tmp/source-'));

    try {
      await mkdir(path.join(root, 'demo/templates/Home'), { recursive: true });
      await writeFile(path.join(root, 'demo/site.config.ts'),
        "export default {siteId:'site', publicSettings:{locale:'en'}, templates:{Home:{parameters:[]}}}");
      await writeFile(path.join(root, 'demo/templates/Home/index.html'),
        '<!doctype html><html><head></head><body>[[*title]]</body></html>');
      const adapter = new FileRenderingSourceAdapter(root);
      const result = await adapter.read('site');

      expect(result.siteKey).toBe('demo');
      expect(result.settings).toEqual({ locale: 'en' });
      expect(result.templates[0]?.id).toBe('Home');
      await expect(adapter.read('foreign')).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
