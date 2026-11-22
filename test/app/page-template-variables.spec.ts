import { TemplateVariableService } from '../../src/app/services/template-variables/template-variable.service.js';
import {
  TemplateVariablePagePublicationService,
} from '../../src/app/services/template-variables/template-variable-page-publication.service.js';
import {
  SavePageTemplateVariablesUseCase,
} from '../../src/app/use-cases/template-variables/save-page-template-variables.use-case.js';
import { Page } from '../../src/domain/pages/page.js';
import { BrowserInteraction, HtmlDelivery } from '../../src/domain/pages/page-rendering.js';
import { TemplateVariableKind } from '../../src/domain/template-variables/template-variable.js';
import { pageFixture } from '../support/pages.js';
import { siteFixture } from '../support/sites.js';

describe('page TV values and logical media', () => {
  it('publishes raw text without validating required fields of a dormant HTML template', async () => {
    const reads = vi.fn(async () => ({ version: 'm1', pending: false, files: [] }));
    const catalog = {
      siteId: 'site-1',
      version: 'c1',
      fields: [{
        name: 'requiredText',
        caption: 'Required',
        description: '',
        kind: TemplateVariableKind.Text,
        templateIds: ['Game'],
        required: true,
        sortOrder: 100,
      }],
    };
    const variables = new TemplateVariableService({ read: async () => catalog, save: vi.fn() }, { read: reads });
    const service = new TemplateVariablePagePublicationService({
      publish: async (state, at) => {
        const page = new Page(state);

        page.publish(at);

        return page;
      },
      versions: async () => [],
      restore: async (_expected, _selected, _position, draft) => draft,
    }, variables);
    const state = {
      ...pageFixture().toState(),
      mimeType: 'text/plain',
      rendering: {
        templateId: 'Game',
        delivery: HtmlDelivery.Static,
        interaction: BrowserInteraction.None,
        parameters: {},
        loaders: [],
      },
    };

    expect((await service.publish(state, new Date('2026-11-01T00:00:00Z'))).mimeType).toBe('text/plain');
    expect(reads).not.toHaveBeenCalled();
  });
  const field = {
    name: 'photo',
    caption: 'Photo',
    description: '',
    kind: TemplateVariableKind.Image,
    templateIds: ['Game'],
    required: false,
    sortOrder: 100,
  };
  const image = { kind: 'Image', fileId: 'photo-1', mode: 'Responsive', alt: 'A game' };
  const catalog = { siteId: 'site-1', version: 'c1', fields: [field] };

  it('resolves logical media, permits saved missing files and rejects new foreign references', async () => {
    let files = [{
      fileId: 'photo-1',
      name: 'renamed.webp',
      mimeType: 'image/webp',
      outputs: [
        {
          key: 'w320',
          url: '/assets/images/renamed--w320.webp',
          mimeType: 'image/webp',
          dimensions: { width: 320, height: 107 },
        },
      ],
    }];
    const media = { read: async () => ({ version: 'm1', pending: false, files }) };
    const definitions = { read: async () => catalog, save: vi.fn() };
    const service = new TemplateVariableService(definitions, media);
    const page = new Page({ ...pageFixture().toState(), tvValues: { photo: image } });
    const store = { save: vi.fn(async (_expected, next) => next) };
    const operation = new SavePageTemplateVariablesUseCase({ execute: async () => siteFixture() },
      { execute: async () => page }, definitions, { list: async () => [{ key: 'Game' }] }, media, store);

    expect(await service.prepare('site-1', { photo: image })).toMatchObject({
      photo: {
        src: '/assets/images/renamed--w320.webp', width: 320, height: 107, missing: false,
      },
    });
    files = [];
    expect(await service.prepare('site-1', { photo: image })).toMatchObject({ photo: { missing: true } });
    const input = {
      siteId: 'site-1',
      pageId: 'page-1',
      templateId: 'Game',
      values: { photo: image },
      expectedUpdatedAt: page.toState().updatedAt,
      catalogVersion: 'c1',
      mediaVersion: 'm1',
    };

    await expect(operation.execute(input)).resolves.toMatchObject({ tvValues: { photo: image } });
    await expect(operation.execute({ ...input, values: { photo: { ...image, fileId: 'foreign' } } }))
      .rejects.toMatchObject({ code: 'NotFound' });
    await expect(operation.execute({ ...input, catalogVersion: 'stale' })).rejects.toMatchObject({ code: 'Conflict' });
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  it('freezes defaults and checks required values only at publication', async () => {
    const defaults = {
      siteId: 'site-1',
      version: 'c1',
      fields: [{
        ...field, name: 'summary', kind: TemplateVariableKind.Text, required: true, defaultValue: 'Default',
      }],
    };
    const service = new TemplateVariableService({ read: async () => defaults, save: vi.fn() },
      { read: async () => ({ version: '0', pending: false, files: [] }) });
    const state = pageFixture().toState();
    const rendering = {
      templateId: 'Game',
      delivery: HtmlDelivery.Static,
      interaction: BrowserInteraction.None,
      parameters: {},
      loaders: [],
    };

    expect(await service.freeze({ ...state, rendering })).toEqual({ summary: 'Default' });
    await expect(service.freeze({ ...state, rendering, tvValues: { summary: null } }))
      .rejects.toMatchObject({ code: 'Validation' });
    expect(await service.freeze({
      ...state,
      rendering: { ...rendering, templateId: 'Other' },
      tvValues: { summary: 'Own' },
    }))
      .toEqual({ summary: 'Own' });
  });
});
