import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createConnection } from 'mongoose';

import { publicationModels } from '../../src/adapters/outbound/persistence/mongoose/publication/publication.models.js';
import { decodePlan } from '../../src/adapters/outbound/publication/files/plan-decoder.js';
import {
  FilePublishedContentAdapter,
} from '../../src/adapters/outbound/publication/files/published-content.adapter.js';
import { artifact } from '../../src/adapters/outbound/rendering/vite/artifacts.js';
import { HtmlDelivery } from '../../src/domain/pages/page-rendering.js';
import { ReleaseState } from '../../src/domain/publication/publication-release.js';
import { PublishedRouteKind } from '../../src/domain/publication/published-route.js';
import { source } from '../support/publication.js';

describe('published private plan decoding', () => {
  it('revives UTC dates, checks declared identity and rejects corrupt stored bytes', async () => {
    const root = await mkdtemp(path.resolve('.tmp/read-plan-'));
    const connection = createConnection();
    const models = publicationModels(connection);
    const fixture = source('Hello');
    const page = {
      ...fixture.pages[0]!,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      ogTitle: 'Frozen social title',
      rendering: { ...fixture.pages[0]!.rendering!, delivery: HtmlDelivery.Request },
    };
    const planData = {
      planId: 'page-1',
      siteId: 'site-1',
      pageId: 'page-1',
      page,
      rendering: page.rendering,
      settings: {},
      requestParameters: [],
      buildValues: {},
      templates: fixture.templates.map((template) => ({ ...template, name: 'Saved ' + template.id })),
      loaders: [],
      frontendSourceIds: [],
      assets: {
        head: '<link rel="icon" type="image/x-icon" href="/favicon.ico?v=' + 'a'.repeat(64)
          + '" data-zarya-favicon>',
        body: '',
      },
    };
    const serialized = JSON.stringify(planData);
    const legacyPage = Object.fromEntries(Object.entries(page).filter(([key]) => !key.startsWith('og')));
    const legacyStored: unknown = JSON.parse(JSON.stringify({ ...planData, page: legacyPage }));

    expect(decodePlan(legacyStored).plan.page.ogTitle).toBeNull();
    const file = artifact('plans/page-1.json', 'application/json', serialized, false);
    const query = models.releases.findOne();

    vi.spyOn(query, 'exec').mockResolvedValue(new models.releases({
      _id: 'release-1',
      siteId: 'site-1',
      siteKey: 'demo',
      state: ReleaseState.Ready,
      createdAt: new Date(),
      completedAt: new Date(),
      failure: null,
      manifest: {
        artifacts: [{
          path: file.path,
          mimeType: file.mimeType,
          byteSize: file.byteSize,
          checksum: file.checksum,
          public: false,
        }],
        routes: [{
          kind: PublishedRouteKind.Request,
          urlId: 'url',
          path: '/',
          pageId: 'page-1',
          renderPlanId: 'page-1',
        }],
      },
    }));
    vi.spyOn(models.releases, 'findOne').mockReturnValue(query);
    const directory = path.join(root, 'sites/demo/release-1/plans');

    await mkdir(directory, { recursive: true });
    const filename = path.join(directory, 'page-1.json');

    await writeFile(filename, serialized);

    try {
      const adapter = new FilePublishedContentAdapter(root, models.releases, {
        primaryDomain: async () => 'example.test',
      });
      const result = await adapter.readPlan('site-1', 'release-1', 'page-1');
      const expectedFingerprint = createHash('sha256').update(JSON.stringify({
        siteId: 'site-1',
        releaseId: 'release-1',
        ...decodePlan(JSON.parse(serialized)),
      })).digest('hex');

      expect(result?.contentFingerprint).toBe(expectedFingerprint);
      expect(result?.plan.page.createdAt).toBeInstanceOf(Date);
      expect(result?.plan.page.ogTitle).toBe('Frozen social title');
      expect(result?.plan.page.createdAt.toISOString()).toBe(page.createdAt.toISOString());
      expect(result?.plan.templates[1]?.name).toBe('Saved Card');
      expect(await adapter.readPlan('site-1', 'release-1', 'page-1')).toEqual(result);
      expect(models.releases.findOne).toHaveBeenCalledOnce();
      result!.plan.page.createdAt.setUTCFullYear(2000);
      const detached = await adapter.readPlan('site-1', 'release-1', 'page-1');

      expect(detached!.contentFingerprint).toBe(expectedFingerprint);
      expect(detached!.plan.page.createdAt.toISOString()).toBe(page.createdAt.toISOString());

      for (const head of [
        '<link rel="stylesheet" href="/assets/releases/foreign/styles/missing.css">',
        '<link rel="icon" type="image/x-icon" href="https://foreign.test/favicon.ico?v='
          + 'a'.repeat(64) + '" data-zarya-favicon>',
        '<link rel="icon" type="image/x-icon" href="/favicon.ico?v=invalid" data-zarya-favicon>',
      ]) {
        const invalid = JSON.stringify({
          ...JSON.parse(serialized),
          assets: {
            head,
            body: '',
          },
        });
        const invalidFile = artifact(file.path, file.mimeType, invalid, false);
        const record = await query.exec();

        if (!record?.manifest) {
          throw new Error('Expected fixture');
        }
        record.set('manifest', {
          ...record.manifest,
          artifacts: [{
            path: file.path,
            mimeType: file.mimeType,
            byteSize: invalidFile.byteSize,
            checksum: invalidFile.checksum,
            public: false,
          }],
        });
        adapter.purgePlans();
        await writeFile(filename, invalid);
        await expect(adapter.readPlan('site-1', 'release-1', 'page-1')).rejects.toThrow();
      }
      await writeFile(filename, '{}');
      await expect(adapter.readPlan('site-1', 'release-1', 'page-1')).rejects.toThrow();
      await expect(adapter.readPlan('site-1', 'release-1', '../private')).rejects.toThrow();
    } finally {
      await connection.close();

      if ((await realpath(root)).startsWith(path.resolve('.tmp') + path.sep)) {
        await rm(root, { recursive: true, force: true });
      }
    }
  });
});
