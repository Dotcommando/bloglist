import { createConnection } from 'mongoose';

import { MediaUsagesAdapter } from '../../src/adapters/outbound/media/references/media-usages.adapter.js';
import {
  TemplateVariableMediaReferencesAdapter,
} from '../../src/adapters/outbound/media/references/template-variable-media-references.adapter.js';
import {
  PublicationMediaReferencesAdapter,
} from '../../src/adapters/outbound/persistence/mongoose/publication/media-references.adapter.js';
import {
  publicationModels,
} from '../../src/adapters/outbound/persistence/mongoose/publication/publication.models.js';
import {
  RenderingMediaReferencesAdapter,
} from '../../src/adapters/outbound/rendering/modx/media-references.adapter.js';
import { ModxCompositionAdapter } from '../../src/adapters/outbound/rendering/modx/template-composition.adapter.js';
import { artifact } from '../../src/adapters/outbound/rendering/vite/artifacts.js';
import { MediaUsageTargetKind } from '../../src/domain/media/file-library.js';
import { PageStatus } from '../../src/domain/pages/page-status.enum.js';
import { ReleaseState } from '../../src/domain/publication/publication-release.js';
import { TemplateVariableKind } from '../../src/domain/template-variables/template-variable.js';
import { source } from '../support/publication.js';

describe('media reference source boundaries', () => {
  it('finds retained source-map and emitted JavaScript references without decoding them as Request plans', async () => {
    const url = '/assets/images/photo.png';
    const model = publicationModels(createConnection()).releases;
    const query = model.find();

    vi.spyOn(model, 'find').mockReturnValue(query);
    vi.spyOn(query, 'lean').mockReturnValue(query);
    vi.spyOn(query, 'exec').mockResolvedValue([new model({
      _id: 'release',
      siteId: 'site-1',
      state: ReleaseState.Ready,
      manifest: null,
      failure: null,
      createdAt: new Date('2026-10-31T00:00:00Z'),
      completedAt: new Date('2026-10-31T00:00:00Z'),
    })]);
    const files = {
      readArtifacts: async () => [
        artifact('diagnostics/client.map', 'application/json', JSON.stringify({
          version: 3,
          sources: ['client.ts'],
          sourcesContent: ['const image = "' + url + '";'],
          mappings: '',
        }), false),
        artifact('assets/scripts/client.js', 'text/javascript', 'const image = "' + url + '";'),
      ],
    };
    const usages = await new MediaUsagesAdapter([new PublicationMediaReferencesAdapter(model, files)])
      .find('site-1', [url]);

    expect(usages.every((usage) => usage.target.kind === MediaUsageTargetKind.Site
      && usage.target.id === 'site-1' && !('editorPath' in usage))).toBe(true);
    expect(usages).toEqual([
      expect.objectContaining({ group: 'Templates', field: 'diagnostics/client.map', state: 'Release release' }),
      expect.objectContaining({ group: 'Templates', field: 'assets/scripts/client.js', state: 'Release release' }),
    ]);
  });

  it('includes literal and stable-ID TV defaults and rejects a foreign catalog', async () => {
    const read = vi.fn(async () => ({
      siteId: 'site-1',
      version: 'tv1',
      fields: [{
        name: 'photo',
        caption: 'Photo',
        description: '',
        templateIds: ['Home'],
        required: false,
        sortOrder: 0,
        kind: TemplateVariableKind.Image,
        defaultValue: { kind: 'Image', fileId: 'image' },
      }],
    }));
    const references = new TemplateVariableMediaReferencesAdapter({ read });
    const usages = await new MediaUsagesAdapter([references]).find('site-1', ['/assets/images/photo.png'], 'image');

    expect(usages).toEqual([expect.objectContaining({
      target: { kind: MediaUsageTargetKind.TemplateVariable, id: 'photo' }, field: 'defaultValue',
    })]);
    await expect(references.read('foreign-site')).rejects.toThrow('Foreign TV catalog');
  });

  it('includes site-wide CSS and script sources', async () => {
    const url = '/media/images/photo.png';
    const sources = {
      read: async () => ({
        siteKey: 'demo',
        settings: {},
        requestParameters: [],
        templates: [],
        frontendSources: [{
          id: 'site',
          revision: 'v1',
          css: '.hero{background:url(' + url + ')}',
          browserTypeScript: 'const image = "' + url + '";',
        }],
      }),
    };
    const usages = await new MediaUsagesAdapter([new RenderingMediaReferencesAdapter(sources)]).find('site-1', [url]);

    expect(usages).toHaveLength(2);
    expect(usages.every((usage) => usage.group === 'Templates'
      && usage.target.kind === MediaUsageTargetKind.Site && usage.target.id === 'site-1')).toBe(true);
  });

  it('decodes retained Request plans and separates content, OG and template references', async () => {
    const url = '/media/images/photo.png';
    const input = source('<img src="' + url + '" width="20" height="10">[[*contentMd:markdown]]');
    const plan = await new ModxCompositionAdapter().prepare({
      ...input,
      pages: input.pages.map((page) => ({
        ...page,
        status: PageStatus.PUBLISHED,
        publishedAt: new Date('2026-10-27T00:00:00Z'),
        contentMd: '<img src="' + url + '" width="20" height="10">',
        ogImage: 'https://example.test' + url,
      })),
    }, 'page-1');
    const model = publicationModels(createConnection()).releases;
    const query = model.find();

    vi.spyOn(model, 'find').mockReturnValue(query);
    vi.spyOn(query, 'lean').mockReturnValue(query);
    vi.spyOn(query, 'exec').mockResolvedValue([new model({
      _id: 'release',
      siteId: 'site-1',
      state: ReleaseState.Ready,
      manifest: null,
      failure: null,
      createdAt: new Date(),
      completedAt: new Date(),
    })]);
    const files = {
      readArtifacts: async () => [artifact('plans/plan.json', 'application/json',
        JSON.stringify({ ...plan, assets: { head: '', body: '' } }), false)],
    };
    const usages = await new MediaUsagesAdapter([new PublicationMediaReferencesAdapter(model, files)])
      .find('site-1', [url]);

    expect(usages.find((usage) => usage.group === 'Content')?.target)
      .toEqual({ kind: MediaUsageTargetKind.Page, id: 'page-1' });
    expect(usages.find((usage) => usage.field === 'Request template')?.target)
      .toEqual({ kind: MediaUsageTargetKind.Template, id: input.templates[0]!.id });
    expect(usages.map((usage) => usage.group)).toEqual(expect.arrayContaining(['Content', 'OpenGraph', 'Templates']));
  });
});
