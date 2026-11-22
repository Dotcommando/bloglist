import { expect, it, vi } from 'vitest';

import { FilePublicationStoreAdapter } from
  '../../src/adapters/outbound/publication/files/publication-store.adapter.js';
import { HtmlDelivery } from '../../src/domain/pages/page-rendering.js';
import { UPDATE_PAGE } from '../../src/infra/pages/pages.tokens.js';
import { PUBLISH_PAGE, PUBLISH_SITE_RELEASE } from '../../src/infra/publication/publication.tokens.js';
import type { IPublishPage } from '../../src/ports/inbound/pages/publish-page.port.js';
import type { IUpdatePage } from '../../src/ports/inbound/pages/update-page.port.js';
import type { IPublishSiteRelease } from '../../src/ports/inbound/publication/publish-site-release.port.js';
import { forkHarness, workerMessage } from '../support/fork-harness.js';

it.each([HtmlDelivery.Request, HtmlDelivery.Static])('publishes without downtime: %s', async (delivery) => {
  const f = await forkHarness({ delivery });
  const site = f.sites[0]!;
  const neighbor = f.sites[1]!;
  const stage = FilePublicationStoreAdapter.prototype.stage;
  let resume = (): void => {};
  let staged = (): void => {};
  const stagedSignal = new Promise<void>((resolve) => {
    staged = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    resume = resolve;
  });
  let keepReading = true;
  const replies: Awaited<ReturnType<typeof f.read>>[] = [];
  let traffic: Promise<void[]> | undefined;
  let held: Promise<Awaited<ReturnType<typeof f.read>>> | undefined;

  try {
    await f.supervisor.pool.resize(site.siteId, 3);
    const pids = new Set<string>();
    const oldAssets = new Set<string>();

    for (let i = 0; i < 9; i++) {
      const response = await f.read(site.host);

      expect(response.status).toBe(200);
      expect(response.body).toContain('One old');
      pids.add(response.worker!);

      for (const match of response.body.matchAll(/(?:href|src)=["']?(\/assets\/releases\/[^"'\s>]+)/g)) {
        oldAssets.add(match[1]!);
      }
    }
    expect(pids.size).toBe(3);
    const worker = f.supervisor.pool.select(site.siteId);
    const armed = workerMessage(worker.child, 'test-plan-armed');

    worker.child.send({ kind: 'test-hold-plan' });
    await armed;
    const holding = workerMessage(worker.child, 'test-plan-held');

    f.supervisor.pool.select(site.siteId);
    f.supervisor.pool.select(site.siteId);
    held = f.read(site.host);
    void held.catch(() => {});
    expect((await holding).releaseId).toBe(site.releaseId);

    await f.local.get<IUpdatePage>(UPDATE_PAGE).execute({ siteId: site.siteId, pageId: site.pageId, title: 'One new' });
    await f.local.get<IPublishPage>(PUBLISH_PAGE).execute({ siteId: site.siteId, pageId: site.pageId });
    vi.spyOn(FilePublicationStoreAdapter.prototype, 'stage').mockImplementation(async function (
      this: FilePublicationStoreAdapter, ...args
    ) {
      await Reflect.apply(stage, this, args);
      staged();
      await gate;
    });
    traffic = Promise.all(Array.from({ length: 4 }, async () => {
      while (keepReading) {
        replies.push(await f.read(site.host));
        const other = await f.read(neighbor.host);

        expect(other.status).toBe(200);
        expect(other.body).toContain('Two old');
      }
    }));
    void traffic.catch(() => {});
    const publishing = f.local.get<IPublishSiteRelease>(PUBLISH_SITE_RELEASE).execute({
      siteId: site.siteId, actorId: 'test', expectedActiveReleaseId: site.releaseId,
    });
    const observed = publishing.then((value) => ({ value }), (error: unknown) => ({ error }));

    await stagedSignal;

    for (let i = 0; i < 6; i++) {
      expect((await f.read(site.host)).body).toContain('One old');
    }

    resume();
    const outcome = await observed;

    expect(outcome).toHaveProperty('value');
    keepReading = false;
    await traffic;
    const after = new Set<string>();

    for (let i = 0; i < 12; i++) {
      const response = await f.read(site.host);

      expect(response.status).toBe(200);
      expect(response.body).toContain('One new');
      expect(response.body).not.toContain('One old');
      after.add(response.worker!);
    }
    expect(after).toEqual(pids);
    expect(oldAssets.size).toBeGreaterThan(0);

    for (const asset of oldAssets) {
      expect((await f.read(site.host, asset)).status).toBe(200);
    }
    worker.child.send({ kind: 'test-release-plan' });
    const old = await held;

    expect(old.status).toBe(200);
    expect(old.body).toContain('One old');
    keepReading = false;
    await traffic;
    expect(replies.length).toBeGreaterThan(0);
    expect(replies.every((reply) => reply.status === 200 && /One (old|new)/.test(reply.body))).toBe(true);

    vi.restoreAllMocks();
    vi.spyOn(FilePublicationStoreAdapter.prototype, 'stage')
      .mockRejectedValueOnce(new Error('synthetic build storage failure'));

    if (!('value' in outcome)) {
      throw new Error('Missing activation');
    }
    await expect(f.local.get<IPublishSiteRelease>(PUBLISH_SITE_RELEASE).execute({
      siteId: site.siteId, actorId: 'test', expectedActiveReleaseId: outcome.value.releaseId,
    })).rejects.toThrow('synthetic');
    expect((await f.read(site.host)).body).toContain('One new');
  } finally {
    keepReading = false;
    resume();
    vi.restoreAllMocks();

    for (const entry of f.sites) {
      for (let i = 0; i < f.supervisor.pool.running(entry.siteId); i++) {
        f.supervisor.pool.select(entry.siteId).child.send({ kind: 'test-release-plan' });
      }
    }
    await Promise.allSettled([traffic, held]);
    await f.close();
  }
}, 90000);
