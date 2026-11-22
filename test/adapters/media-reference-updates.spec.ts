import type { Mock } from 'vitest';

import {
  MediaReferenceUpdatesAdapter,
} from '../../src/adapters/outbound/media/references/media-reference-updates.adapter.js';
import { Page } from '../../src/domain/pages/page.js';
import { BrowserInteraction, HtmlDelivery } from '../../src/domain/pages/page-rendering.js';
import { TemplateSourceKind } from '../../src/domain/publication/render-plan.js';
import { TemplateVariableKind } from '../../src/domain/template-variables/template-variable.js';
import type { IListPages } from '../../src/ports/inbound/pages/list-pages.port.js';
import type { IRenderingOperations } from '../../src/ports/inbound/rendering/rendering-elements.port.js';
import type {
  ITemplateVariableOperations,
} from '../../src/ports/inbound/template-variables/template-variables.port.js';
import { pageFixture } from '../support/pages.js';
import { elementFixture } from '../support/rendering.js';
import { siteFixture } from '../support/sites.js';

interface IReferenceFixture {
  source: ReturnType<typeof elementFixture>;
  elements: {
    list: { execute: Mock<IRenderingOperations['list']['execute']> };
    update: { execute: Mock<IRenderingOperations['update']['execute']> };
  };
  variables: {
    list: { execute: Mock<ITemplateVariableOperations['list']['execute']> };
    save: { execute: Mock<ITemplateVariableOperations['save']['execute']> };
    getPage: { execute: Mock<ITemplateVariableOperations['getPage']['execute']> };
    savePage: { execute: Mock<ITemplateVariableOperations['savePage']['execute']> };
  };
  pages: { execute: Mock<IListPages['execute']> };
  pageReferences: { execute: Mock<(input: unknown) => Promise<void>> };
  sites: { execute: Mock<() => Promise<ReturnType<typeof siteFixture>>> };
}

function fixture(): IReferenceFixture {
  const source = elementFixture({
    html: '<img src="/assets/images/old.png?x=1"><img src="/assets/images/old.png.extra">'
      + '<img src="https://foreign.test/assets/images/old.png">',
    css: 'a { background: url(/assets/images/old.png); }',
    browserTypeScript: 'const image = "/assets/images/old.png";',
  });
  const elements = {
    list: {
      execute: vi.fn<IRenderingOperations['list']['execute']>(async ({ kind }) =>
        kind === TemplateSourceKind.Template ? [source] : []),
    },
    update: {
      execute: vi.fn<IRenderingOperations['update']['execute']>(async (input) => ({
        ...source, ...input, version: 'v2',
      })),
    },
  };
  const catalog = { siteId: 'site-1', version: 'tv1', fields: [] };
  const variables = {
    list: { execute: vi.fn<ITemplateVariableOperations['list']['execute']>(async () => catalog) },
    save: { execute: vi.fn<ITemplateVariableOperations['save']['execute']>(async () => catalog) },
    getPage: { execute: vi.fn<ITemplateVariableOperations['getPage']['execute']>() },
    savePage: { execute: vi.fn<ITemplateVariableOperations['savePage']['execute']>() },
  };
  const pages = { execute: vi.fn<IListPages['execute']>(async () => []) };
  const sites = { execute: vi.fn(async () => siteFixture()) };

  return { elements, variables, pages, sites, source, pageReferences: { execute: vi.fn(async () => {}) } };
}

function setSource(f: IReferenceFixture, changes: Partial<IReferenceFixture['source']>): void {
  f.source = { ...f.source, ...changes };
  f.elements.list.execute.mockImplementation(async ({ kind }) =>
    kind === TemplateSourceKind.Template ? [f.source] : []);
}

it('rewrites TV defaults and page TV text while keeping stable image identities and concurrency guards', async () => {
  const f = fixture();
  const page = new Page({
    ...pageFixture().toState(),
    rendering: {
      templateId: 'Home',
      delivery: HtmlDelivery.Static,
      interaction: BrowserInteraction.None,
      parameters: {},
      loaders: [],
    },
  });
  const catalog = {
    siteId: 'site-1',
    version: 'tv1',
    fields: [{
      name: 'address',
      caption: 'Address',
      description: '',
      kind: TemplateVariableKind.Text,
      templateIds: ['Home'],
      required: false,
      sortOrder: 0,
      defaultValue: '/assets/images/old.png',
    }],
  };

  f.variables.list.execute.mockResolvedValue(catalog);
  f.pages.execute.mockResolvedValue([page]);
  f.variables.getPage.execute.mockResolvedValue({
    catalog,
    templateId: 'Home',
    updatedAt: page.toState().updatedAt,
    mediaVersion: 'media-v2',
    prepared: {},
    values: { address: '/assets/images/old.png', photo: { kind: 'Image', fileId: 'logical-image', alt: '' } },
  });
  await new MediaReferenceUpdatesAdapter(f.elements, f.variables, f.pages, f.sites,
    f.pageReferences).replace('site-1', [
    { from: '/assets/images/old.png', to: '/assets/images/new.png' },
  ]);
  expect(f.variables.save.execute).toHaveBeenCalledWith({
    siteId: 'site-1',
    expectedVersion: 'tv1',
    fields: [{ ...catalog.fields[0]!, defaultValue: '/assets/images/new.png' }],
  });
  expect(f.variables.savePage.execute).toHaveBeenCalledWith(expect.objectContaining({
    siteId: 'site-1',
    pageId: page.pageId,
    catalogVersion: 'tv1',
    mediaVersion: 'media-v2',
    expectedUpdatedAt: page.toState().updatedAt,
    values: { address: '/assets/images/new.png', photo: { kind: 'Image', fileId: 'logical-image', alt: '' } },
  }));
});

it.each([
  'https://foreign.test/picture?next=/assets/images/old.png',
  '//foreign.test/picture#next=/assets/images/old.png',
  'https://foreign.test/a b?next=/assets/images/old.png',
])('preserves complete foreign URLs including nested media paths: %s', async (foreign) => {
  const f = fixture();

  setSource(f, { html: '<img src="' + foreign + '"><img src="/assets/images/old.png">' });
  await new MediaReferenceUpdatesAdapter(f.elements, f.variables, f.pages, f.sites,
    f.pageReferences).replace('site-1', [
    { from: '/assets/images/old.png', to: '/assets/images/new.png' },
  ]);
  expect(f.elements.update.execute).toHaveBeenCalledWith(expect.objectContaining({
    html: '<img src="' + foreign + '"><img src="/assets/images/new.png">',
  }));
});

it('preserves longer parenthesized filenames, Unicode path prefixes and escaped literals', async () => {
  const f = fixture();
  const longer = '<img src="/assets/images/old.png).webp"><img src="ю/assets/images/old.png">'
    + '<img src="/assets/images/old.png) extra.png"><img src="/assets/images/old.png extra.png">';

  setSource(f, { html: longer + '<img src="/assets/images/old.png">' });
  setSource(f, { browserTypeScript: String.raw`const image = "\/assets/images/old.png";` });
  await new MediaReferenceUpdatesAdapter(f.elements, f.variables, f.pages, f.sites,
    f.pageReferences).replace('site-1', [
    { from: '/assets/images/old.png', to: '/assets/images/new.png' },
  ]);
  expect(f.elements.update.execute).toHaveBeenCalledWith(expect.objectContaining({
    html: longer + '<img src="/assets/images/new.png">',
    browserTypeScript: f.source.browserTypeScript,
  }));
});

it('keeps new filenames URL-encoded and safe inside unquoted CSS url expressions', async () => {
  const f = fixture();

  await new MediaReferenceUpdatesAdapter(f.elements, f.variables, f.pages, f.sites,
    f.pageReferences).replace('site-1', [
    { from: '/assets/images/old.png', to: '/assets/images/new%20file(1).png' },
  ]);
  expect(f.elements.update.execute).toHaveBeenCalledWith(expect.objectContaining({
    html: '<img src="/assets/images/new%20file%281%29.png?x=1"><img src="/assets/images/old.png.extra">'
      + '<img src="https://foreign.test/assets/images/old.png">',
    css: 'a { background: url(/assets/images/new%20file%281%29.png); }',
  }));
});

it('updates exact references through guarded saves, preserving foreign URLs and filename prefixes', async () => {
  const f = fixture();

  await new MediaReferenceUpdatesAdapter(f.elements, f.variables, f.pages, f.sites,
    f.pageReferences).replace('site-1', [
    { from: '/assets/images/old.png', to: '/assets/images/Photos/new.png' },
  ]);
  expect(f.elements.update.execute).toHaveBeenCalledWith(expect.objectContaining({
    siteId: 'site-1',
    expectedVersion: 'v1',
    html: '<img src="/assets/images/Photos/new.png?x=1"><img src="/assets/images/old.png.extra">'
      + '<img src="https://foreign.test/assets/images/old.png">',
    css: 'a { background: url(/assets/images/Photos/new.png); }',
    browserTypeScript: 'const image = "/assets/images/Photos/new.png";',
  }));
  expect(f.variables.save.execute).not.toHaveBeenCalled();
  expect(f.elements.list.execute).toHaveBeenCalledWith({ siteId: 'site-1', kind: TemplateSourceKind.Chunk });
});

it('preserves guarded absolute addresses, srcset descriptors and adjacent CSS URLs', async () => {
  const f = fixture();
  const domain = (await f.sites.execute()).toState().primaryDomain;
  const foreign = 'https://foreign.test/?next=/assets/images/old.png';

  setSource(f, {
    html: '<img src="https://' + domain + '/assets/images/old.png">'
    + '<img srcset="/assets/images/old.png 1x, /assets/images/old.png 2x">',
  });
  setSource(f, { css: 'a{background:url(' + foreign + '),url(/assets/images/old.png)}' });
  await new MediaReferenceUpdatesAdapter(f.elements, f.variables, f.pages, f.sites,
    f.pageReferences).replace('site-1', [
    { from: '/assets/images/old.png', to: '/assets/images/new.png' },
  ]);
  expect(f.elements.update.execute).toHaveBeenCalledWith(expect.objectContaining({
    html: '<img src="https://' + domain + '/assets/images/new.png">'
      + '<img srcset="/assets/images/new.png 1x, /assets/images/new.png 2x">',
    css: 'a{background:url(' + foreign + '),url(/assets/images/new.png)}',
  }));
});

it.each(['https://foreign.test/picture?next=/assets/images/old.png', 'https://example.test/other.png'])('keeps absolute and relative srcset candidates separate: %s', async (absolute) => {
  const f = fixture();

  setSource(f, { html: '<img srcset="' + absolute + ' 1x, /assets/images/old.png 2x">' });
  await new MediaReferenceUpdatesAdapter(f.elements, f.variables, f.pages, f.sites,
    f.pageReferences).replace('site-1', [
    { from: '/assets/images/old.png', to: '/assets/images/new.png' },
  ]);
  expect(f.elements.update.execute).toHaveBeenCalledWith(expect.objectContaining({
    html: '<img srcset="' + absolute + ' 1x, /assets/images/new.png 2x">',
  }));
});

it('does not mistake a Unicode attribute prefix for srcset', async () => {
  const f = fixture();
  const html = '<div юsrcset="https://foreign.test/a b?next=/assets/images/old.png"></div>';

  setSource(f, { html: html + '<img src="/assets/images/old.png">' });
  await new MediaReferenceUpdatesAdapter(f.elements, f.variables, f.pages, f.sites,
    f.pageReferences).replace('site-1', [
    { from: '/assets/images/old.png', to: '/assets/images/new.png' },
  ]);
  expect(f.elements.update.execute).toHaveBeenCalledWith(expect.objectContaining({
    html: html + '<img src="/assets/images/new.png">',
  }));
});

it('recognizes encoded parentheses from an earlier rename', async () => {
  const f = fixture();

  setSource(f, { html: '<img src="/assets/images/new%20file%281%29.png">' });
  await new MediaReferenceUpdatesAdapter(f.elements, f.variables, f.pages, f.sites,
    f.pageReferences).replace('site-1', [
    { from: '/assets/images/new%20file(1).png', to: '/assets/images/final.png' },
  ]);
  expect(f.elements.update.execute).toHaveBeenCalledWith(expect.objectContaining({
    html: '<img src="/assets/images/final.png">',
  }));
});

it('observes a failed source save immediately and stops further writes', async () => {
  const f = fixture();

  f.elements.update.execute.mockRejectedValue(new Error('stale source'));
  await expect(new MediaReferenceUpdatesAdapter(f.elements, f.variables, f.pages, f.sites,
    f.pageReferences).replace('site-1', [
    { from: '/assets/images/old.png', to: '/assets/images/new.png' },
  ])).rejects.toThrow('stale source');
  expect(f.variables.save.execute).not.toHaveBeenCalled();
});
