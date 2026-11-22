import { describe, expect, it, vi } from 'vitest';

import { CmsApiService, isCmsObject } from '../../src/app/services/cms/cms-api.service.js';
import type { CmsApi, ICmsCoreOperations } from '../../src/ports/inbound/cms/cms-api.port.js';

const context = { siteId: 'site-a', actorId: 'extension-a' };

function fixture(): {
  service: CmsApiService;
  cms: CmsApi;
  get: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
} {
  const get = vi.fn(async (input: unknown) => ({
    ...Object(input),
    title: 'Draft',
    updatedAt: new Date('2026-10-31T12:00:00Z'),
  }));
  const update = vi.fn(async (input: unknown) => input);
  const list = vi.fn(async () => Array.from({ length: 75 }, (_, index) => ({
    pageId: String(index), siteId: 'site-a', title: String(index % 3), parentPageId: index < 60 ? 'parent' : null,
  })));
  const operations: ICmsCoreOperations = Object.assign(Object.create(null), {
    pages: {
      get: { execute: get },
      getDraft: { execute: get },
      update: { execute: update },
      list: { execute: list },
    },
  });
  const service = new CmsApiService({ forContext: () => operations });

  return { service, cms: service.forContext(context), get, update, list };
}

describe('CMS object API', () => {
  it('binds trusted identity, returns detached data and UTC instants', async () => {
    const { cms, get } = fixture();
    const result = await cms.pages.get({ pageId: 'page-a' });

    expect(get).toHaveBeenCalledWith({ siteId: 'site-a', actorId: 'extension-a', pageId: 'page-a' });
    expect(result).toMatchObject({ title: 'Draft', updatedAt: '2026-10-31T12:00:00.000Z' });
  });

  it('rejects identity injection and prototype operations before invoking a port', async () => {
    const { service, get } = fixture();

    await expect(service.invoke(context, 'pages', 'get', { pageId: 'p', siteId: 'site-b' })).rejects.toThrow();
    await expect(service.invoke(context, 'pages', 'constructor', {})).rejects.toThrow();
    await expect(service.invoke(context, '__proto__', 'get', {})).rejects.toThrow();
    expect(get).not.toHaveBeenCalled();
  });

  it('applies defaults, filters before pagination, sorts deterministically and has no upper cap', async () => {
    const { service } = fixture();
    const defaults = await service.invoke(context, 'pages', 'list', {});
    const selected = await service.invoke(context, 'pages', 'list', {
      parentId: 'parent', offset: 3, limit: 5000, sortby: [{ field: 'title', direction: 'desc' }],
    });

    expect(defaults).toMatchObject({ total: 75, limit: 50, offset: 0 });

    if (
      !isCmsObject(defaults)
      || !Array.isArray(defaults.items)
      || !isCmsObject(selected)
      || !Array.isArray(selected.items)
    ) {
      throw new Error('Expected list envelopes');
    }
    expect(defaults.items).toHaveLength(50);
    expect(selected).toMatchObject({ total: 60, limit: 5000, offset: 3 });
    expect(selected.items).toHaveLength(57);
    expect(selected.items[0]).toMatchObject({ title: '2' });
  });

  it.each([
    { limit: 0 }, { limit: null }, { offset: null }, { sortby: null },
    { limit: 1.5 }, { offset: -1 }, { mystery: true },
    { sortby: [{ field: 'passwordHash', direction: 'asc' }] },
    { sortby: [{ field: 'title', direction: 'sideways' }] },
    { filter: { $where: 'true' } },
  ])('rejects unsupported list input %j', async (input) => {
    const { service, list } = fixture();

    await expect(service.invoke(context, 'pages', 'list', input)).rejects.toThrow();
    expect(list).not.toHaveBeenCalled();
  });

  it('keeps business kind selectors while protecting element kind and cancellation identity', async () => {
    const execute = vi.fn(async (input: unknown) => input);
    const operations: ICmsCoreOperations = Object.assign(Object.create(null), {
      hooks: { create: { execute } },
      urls: { materialize: { execute } },
      templates: { create: { execute } },
    });
    const service = new CmsApiService({ forContext: () => operations });

    expect(await service.invoke(context, 'hooks', 'create', { kind: 'Check' })).toMatchObject({ kind: 'Check' });
    expect(await service.invoke(context, 'urls', 'materialize', { kind: 'PAGE' })).toMatchObject({ kind: 'PAGE' });
    await expect(service.invoke(context, 'templates', 'create', { kind: 'Snippet' })).rejects.toThrow();
    await expect(service.invoke(context, 'hooks', 'create', { signal: {} })).rejects.toThrow();
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('sorts missing, null and scalar fields consistently', async () => {
    const { service, list } = fixture();

    list.mockResolvedValueOnce([
      { pageId: 'missing' }, { pageId: 'null', parentPageId: null }, { pageId: 'scalar', parentPageId: 'x' },
    ]);
    const result = await service.invoke(context, 'pages', 'list', {
      sortby: [{ field: 'parentPageId', direction: 'asc' }],
    });

    expect(result).toMatchObject({
      items: [
        { pageId: 'missing' }, { pageId: 'null' }, { pageId: 'scalar' },
      ],
    });
  });

  it('retains an acknowledged command when later rendering fails', async () => {
    const { cms, update } = fixture();

    await cms.pages.update({ pageId: 'p', title: 'Changed' });
    await expect(Promise.reject(new Error('Rendering failed'))).rejects.toThrow('Rendering failed');
    expect(update).toHaveBeenCalledOnce();
  });
});
