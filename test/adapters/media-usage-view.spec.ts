import { createServer } from 'node:http';

import { CmsMediaUsagesAdapter } from '../../src/adapters/inbound/cms/cms-media-usages.adapter.js';
import { AdminFilesController } from '../../src/adapters/inbound/rest/media/admin-files.controller.js';
import { CmsApiService } from '../../src/app/services/cms/cms-api.service.js';
import { type IMediaUsage, MediaUsageGroup, MediaUsageTargetKind } from '../../src/domain/media/file-library.js';
import type { ICmsCoreOperations } from '../../src/ports/inbound/cms/cms-api.port.js';
import type { IFileLibraryOperations } from '../../src/ports/inbound/media/file-library.port.js';

describe('media usage transport compatibility', () => {
  it('keeps the existing administrative JSON and editor links while consuming neutral reference targets', async () => {
    const targets: readonly (readonly [MediaUsageTargetKind, string, string])[] = [
      [MediaUsageTargetKind.Page, 'page', 'pages/page'],
      [MediaUsageTargetKind.Template, 'template', 'templates/template'],
      [MediaUsageTargetKind.Chunk, 'chunk', 'chunks/chunk'],
      [MediaUsageTargetKind.Snippet, 'snippet', 'snippets/snippet'],
      [MediaUsageTargetKind.Site, 'site-1', 'templates'],
      [MediaUsageTargetKind.TemplateVariable, 'photo', 'template-variables'],
    ];
    const usages = targets.map(([kind, id, suffix]) => ({
      value: {
        group: MediaUsageGroup.Content,
        title: 'Title',
        field: 'contentMd',
        state: 'Draft',
        target: { kind, id },
      } satisfies IMediaUsage,
      expected: {
        group: 'Content',
        title: 'Title',
        field: 'contentMd',
        state: 'Draft',
        editorPath: '/admin/sites/site-1/' + suffix,
      },
    }));
    const operation = vi.fn(async () => ({ version: 'v1', usages: usages.map((item) => item.value) }));
    const operations: IFileLibraryOperations = Object.assign(Object.create(null), { usages: { execute: operation } });
    const server = createServer();

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Missing address');
    }

    const origin = 'http://127.0.0.1:' + address.port;
    const controller = new AdminFilesController({ origin }, {
      forSession: () => ({ ...operations, readableUsageTargets: async () => new Set<string>() }),
    });

    server.on('request', (request, response) => {
      void controller.handle(request, response);
    });

    try {
      const response = await fetch(origin + '/api/admin/sites/site-1/files/image/usages?expectedVersion=v1', {
        headers: { origin, 'x-zarya-admin': '1', cookie: 'zarya_admin_session=session' },
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ version: 'v1', usages: usages.map((item) => item.expected) });
      const core: ICmsCoreOperations = Object.assign(Object.create(null), {
        files: { usages: new CmsMediaUsagesAdapter(operations.usages) },
      });
      const cms = new CmsApiService({ forContext: () => core }).forContext({ siteId: 'site-1', actorId: 'extension' });

      expect(await cms.files.usages({ fileId: 'image', expectedVersion: 'v1' }))
        .toEqual({ version: 'v1', usages: usages.map((item) => item.expected) });
      expect(operation).toHaveBeenCalledWith({ siteId: 'site-1', fileId: 'image', expectedVersion: 'v1' });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
