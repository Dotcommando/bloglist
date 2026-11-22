import { vi } from 'vitest';

import { ArchivePageUseCase } from '../../../src/app/use-cases/pages/archive-page.use-case.js';
import { Page } from '../../../src/domain/pages/page.js';
import { fakeHookChanges } from '../../support/hooks.js';
import { FakePageRepository, pageFixture } from '../../support/pages.js';

describe('ArchivePage', () => {
  it('archives an owned page without losing its content, publication time or rendering', async () => {
    const pages = new FakePageRepository();
    const original = pageFixture();

    original.publish(new Date('2026-10-24T12:00:00Z'));
    pages.records.set('page-1', original);
    const archive = vi.fn(async (previous) => {
      const next = new Page(previous);

      next.archive();

      return pages.save(next);
    });
    const operation = new ArchivePageUseCase(pages, { archive }, { assertCanUpdatePage: async () => {} },
      fakeHookChanges);
    const result = await operation.execute({ siteId: 'site-1', pageId: 'page-1' });

    expect(result.toState()).toEqual({ ...original.toState(), status: 'ARCHIVED' });
    expect(original.status).toBe('PUBLISHED');
    expect((await operation.execute({ siteId: 'site-1', pageId: 'page-1' })).status).toBe('ARCHIVED');
  });
  it('rejects absent/foreign/denied requests before changing state and propagates failures', async () => {
    const pages = new FakePageRepository();
    const archive = vi.fn();
    const access = { assertCanUpdatePage: vi.fn(async () => {}) };
    const operation = new ArchivePageUseCase(pages, { archive }, access, fakeHookChanges);

    await expect(operation.execute({ siteId: 'site-1', pageId: 'missing' }))
      .rejects.toMatchObject({ name: 'PageNotFoundError' });
    pages.records.set('page-1', pageFixture('page-1', 'foreign'));
    await expect(operation.execute({ siteId: 'site-1', pageId: 'page-1' }))
      .rejects.toMatchObject({ name: 'PageScopeError' });
    expect(archive).not.toHaveBeenCalled();
    access.assertCanUpdatePage.mockRejectedValueOnce(new Error('Denied'));
    await expect(operation.execute({ siteId: 'site-1', pageId: 'page-1' })).rejects.toThrow('Denied');
    pages.records.set('page-1', pageFixture());
    archive.mockRejectedValueOnce(new Error('Unavailable'));
    await expect(operation.execute({ siteId: 'site-1', pageId: 'page-1' })).rejects.toThrow('Unavailable');
    expect(pages.records.get('page-1')?.status).toBe('DRAFT');
  });
});

